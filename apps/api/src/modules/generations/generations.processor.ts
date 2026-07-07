import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job, Queue } from 'bullmq';

import { Generation } from './generation.entity';
import { GENERATIONS_QUEUE } from './generations.constants';
import type { MediaOpJob } from './generations.service';
import { voiceArtistToGender } from '../../common/voice';
import { SunoProvider, findChorusSegment } from '../suno/suno.types';
import { LyricsService } from '../lyrics/lyrics.module';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { User } from '../users/user.entity';
import { MailerService } from '../../mailer/mailer.module';
import { generationReadyTemplate } from '../../mailer/templates/templates';
import { brandingFromSite } from '../../mailer/branding';
import { PromoService } from '../promo/promo.service';
import { SitesService } from '../sites/sites.service';
import { AudioProcessorService } from './audio-processor.service';
import { GenerationMediaService } from '../media/generation-media.service';
import { normalizeTier, packageDef } from '../payments/packages';
import { hashUnlock, generateSharePin } from '../../common/unlock';

// concurrency: 3 — mai multe comenzi avansează în paralel (timpul e dominat de
// așteptarea pe Suno, I/O-bound), ca a 2-a/3-a comandă să nu aștepte în coadă
// după una premium lentă. ffmpeg-ul (CPU) se suprapune rar pe toate 3 simultan.
@Processor(GENERATIONS_QUEUE, { concurrency: 3 })
export class GenerationsProcessor extends WorkerHost {
  private readonly logger = new Logger('GenerationsProcessor');

  constructor(
    @InjectRepository(Generation) private readonly repo: Repository<Generation>,
    @InjectRepository(GuestSession) private readonly guests: Repository<GuestSession>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly suno: SunoProvider,
    private readonly lyricsSvc: LyricsService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly promo: PromoService,
    private readonly sites: SitesService,
    private readonly audio: AudioProcessorService,
    private readonly media: GenerationMediaService,
    private readonly moduleRef: ModuleRef,
    @InjectQueue(GENERATIONS_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  /** Backoff exponențial pentru auto-retry când Suno e căzut.
   *  retryCount=0 → 1 min, 1 → 3 min, 2 → 5 min, 3 → 15 min, 4 → 30 min, 5+ → 60 min.
   *  Cap practic la 50 reîncercări (~50 ore) — peste asta admin trebuie să intervină. */
  private nextRetryDelayMs(retryCount: number): number {
    const minutes = [1, 3, 5, 15, 30, 60][Math.min(retryCount, 5)] ?? 60;
    return minutes * 60_000;
  }

  /** Câte retry-uri automate maxim pentru o generation plătită. ~50 ore total
   *  cu backoff-ul de mai sus. Pentru type='demo' fără paidUnlocked → 3. */
  private maxAutoRetries(gen: Generation): number {
    return gen.paidUnlocked || gen.type === 'full' ? 50 : 3;
  }

  /**
   * Generează un clip SCURT (stil TikTok) din refrenul unei piese.
   *  1. Cere versurile aliniate temporal de la Suno (`getTimestampedLyrics`).
   *  2. Detectează refrenul (`findChorusSegment`).
   *  3. Fallback dacă nu există marker de refren: segment de la 35% din durata
   *     audio (din `gen.tracks[idx].durationSec`), 18s.
   *  4. `generateVideo` cu segmentul → clip scurt.
   * Robust: orice eșec → fallback la `generateVideo` fără segment, apoi `null`.
   */
  private async generateChorusClip(
    gen: Generation,
    opts: { idx: number; audioPath: string; outName: string },
  ): Promise<string | null> {
    const { idx, audioPath, outName } = opts;
    try {
      const audioId = gen.tracks?.[idx]?.audioId;
      let startSec: number | undefined;
      let durationSec: number | undefined;

      if (gen.providerJobId && gen.providerJobId !== 'manual' && audioId) {
        try {
          const lyrics = await this.suno.getTimestampedLyrics(gen.providerJobId, audioId);
          const seg = findChorusSegment(lyrics?.alignedWords);
          if (seg) {
            startSec = seg.startSec;
            durationSec = seg.durationSec;
          }
        } catch (err) {
          this.logger.warn(
            `chorus lyrics fetch failed for ${gen.id} (track ${idx}): ${(err as Error).message}`,
          );
        }
      }

      // Fallback: 35% din durata audio, 18s.
      if (startSec === undefined || durationSec === undefined) {
        const trackDur = gen.tracks?.[idx]?.durationSec ?? 0;
        startSec = trackDur > 0 ? 0.35 * trackDur : 0;
        durationSec = 18;
      }

      return await this.media.generateVideo(gen, {
        audioPath,
        outName,
        startSec,
        durationSec,
      });
    } catch (err) {
      this.logger.warn(
        `chorus clip failed for ${gen.id} (track ${idx}), fallback fără segment: ${(err as Error).message}`,
      );
      try {
        return await this.media.generateVideo(gen, { audioPath, outName });
      } catch (err2) {
        this.logger.warn(
          `chorus clip fallback failed for ${gen.id} (track ${idx}): ${(err2 as Error).message}`,
        );
        return null;
      }
    }
  }

  /** Lazy notification către ChatService — apelat după ce generation termină
   *  (succes sau eșec). Lazy load pentru a evita dependency circular între
   *  GenerationsModule și ChatModule (chat importă payments care importă generations). */
  async notifyChat(generationId: string, status: 'succeeded' | 'failed'): Promise<void> {
    try {
      const mod = await import('../chat/chat.service');
      const chat = this.moduleRef.get(mod.ChatService, { strict: false });
      await chat.notifyGenerationCompleted(generationId, status);
    } catch (e) {
      // ChatService poate lipsi în testing — best-effort
      this.logger.debug?.(`chat notify skipped: ${(e as Error).message}`);
    }
  }

  async process(job: Job<{ generationId: string } | MediaOpJob>): Promise<void> {
    if (job.name === 'media-op') {
      return this.processMediaOp(job.data as MediaOpJob);
    }
    if (job.name === 'upgrade-deliverables') {
      return this.processUpgradeDeliverables((job.data as { generationId: string }).generationId);
    }
    const { generationId } = job.data as { generationId: string };
    const gen = await this.repo.findOne({ where: { id: generationId } });
    if (!gen) {
      this.logger.warn(`generation ${generationId} not found`);
      return;
    }

    // Dacă între enqueue și pick-up admin a încărcat manual fișierul (sau o
    // tentativă anterioară a reușit între timp), sărim peste — nu suprascriem.
    if (gen.status === 'succeeded' || gen.providerJobId === 'manual') {
      this.logger.log(
        `generation ${gen.id} already done (status=${gen.status}, providerJobId=${gen.providerJobId}); skipping`,
      );
      // Curățăm marker-ul de auto-retry — nu mai e nevoie.
      if (gen.nextRetryAt) {
        gen.nextRetryAt = null;
        await this.repo.save(gen);
      }
      return;
    }

    // Încărcăm site-ul comenzii (per-brand prompt + locale lyrics).
    const site = gen.siteId ? await this.sites.findById(gen.siteId) : null;
    const lyricsLocale = site?.suno?.lyricsLocale ?? site?.locale ?? gen.locale ?? 'ro';

    try {
      // Step 1: write lyrics (or use custom)
      gen.status = 'writing_lyrics';
      await this.repo.save(gen);

      const lyricsBase = {
        style: gen.style,
        occasion: gen.occasion,
        recipientName: gen.recipientName,
        message: gen.message,
        dedication: gen.dedication ?? undefined,
        tipAmount: gen.tipAmount,
        voiceArtist: gen.voiceArtist,
        customLyrics: gen.customLyrics ?? undefined,
        locale: lyricsLocale,
        // Override-uri per site pentru OpenAI writer + critic. Când site-ul are
        // limbă proprie (BG/RS/TR/etc.) și are setate aceste prompts în admin,
        // OpenAI primește vocabular nativ (chalga, turbofolk, arabesk) în loc
        // de cel manelist românesc.
        writerSystemPrompt: site?.suno?.writerSystemPrompt,
        writerUserTemplate: site?.suno?.writerUserTemplate,
        criticSystemPrompt: site?.suno?.criticSystemPrompt,
        criticUserTemplate: site?.suno?.criticUserTemplate,
        currency: site?.currency,
        siteId: gen.siteId ?? null,
        generationId: gen.id,
      };

      const draft = await this.lyricsSvc.writeDraft(lyricsBase);
      gen.lyricsDraft = draft;
      gen.status = 'checking_lyrics';
      await this.repo.save(gen);

      // Step 2: critic refines
      const refined = await this.lyricsSvc.refineDraft(lyricsBase, draft);
      gen.lyrics = refined;
      gen.status = 'generating_audio';
      await this.repo.save(gen);

      // Step 2.5: rescriere fonetică „cum se aud" pentru Suno — DOAR pe site-urile
      // cu pasul de review al versurilor activ (decizie 2026-06-15). `gen.lyrics`
      // (afișat în UI + trimis pe email) rămâne varianta corectă; Suno primește
      // varianta fonetică, ca să pronunțe natural. Logat (stage='phonetic'). Nu
      // blochează generarea: la eroare toPhonetic întoarce versurile originale.
      const sunoLyrics = site?.lyricsReviewEnabled
        ? await this.lyricsSvc.toPhonetic(refined, {
            locale: lyricsLocale,
            siteId: gen.siteId ?? null,
            generationId: gen.id,
          })
        : refined;

      // Step 3: audio
      // Citim configurațiile per-voce și per-stil din site (gender, persona,
      // styleWeight, weirdnessConstraint, negativeTags) și le pasăm la Suno.
      const voiceEntry = site?.voices?.find((v) => v.id === gen.voiceArtist);
      const styleEntry = site?.styles?.find((s) => s.id === gen.style);
      // Genul vocal e derivat PRIORITAR din voiceArtist canonic (male/female) +
      // fallback legacy; cade pe voiceEntry?.gender doar dacă helper-ul nu știe.
      const vocalGender = voiceArtistToGender(gen.voiceArtist) ?? voiceEntry?.gender;

      // Durata țintă vine din pachet (premium = 150s). Pentru demo păstrăm
      // durata existentă (scurtă). Defensiv: dacă gen.durationSec lipsește
      // (rânduri vechi), cădem pe durata pachetului.
      const tier = normalizeTier(gen.packageTier);
      const targetDuration =
        gen.type === 'demo' ? gen.durationSec : gen.durationSec || packageDef(tier).durationSec;

      const result = await this.suno.generate({
        type: gen.type,
        durationSec: targetDuration,
        style: gen.style,
        occasion: gen.occasion,
        recipientName: gen.recipientName,
        message: gen.message,
        dedication: gen.dedication ?? undefined,
        voiceArtist: gen.voiceArtist,
        lyrics: sunoLyrics,
        // Versurile puse/acceptate de client (customLyrics) sunt sacre: nu
        // lăsăm provider-ul să mai adauge dedicația în deschidere.
        lyricsAreCustom: !!gen.customLyrics?.trim(),
        generationId: gen.id,
        site: site ?? undefined,
        vocalGender,
        personaId: voiceEntry?.sunoPersonaId,
        styleWeight: styleEntry?.styleWeight,
        weirdnessConstraint: styleEntry?.weirdnessConstraint,
        negativeTags: styleEntry?.negativeTags,
      });

      gen.tracks = result.tracks;
      gen.coverUrl = result.tracks[0]?.coverUrl ?? null;
      gen.providerJobId = result.providerJobId;

      // SECURITATE: descărcăm audio-ul de la Suno la noi și generăm un fișier
      // demo separat (30s + fade-out). Pentru neplătiți, controller-ul expune
      // doar URL-ul demo — nu există cale să recupereze full-ul din network.
      const mainSource = result.tracks[0]?.audioUrl;
      const bonusSource = result.tracks[1]?.audioUrl;
      if (mainSource) {
        try {
          const m = await this.audio.downloadAndMakeDemo(gen.id, mainSource, 'full');
          gen.audioUrl = m.fullUrl;
          gen.demoAudioUrl = m.demoUrl;
        } catch (err) {
          this.logger.error(`audio processing failed for ${gen.id} (main): ${(err as Error).message}`);
          // Fallback: păstrăm URL-ul Suno DOAR la noi în DB ca audioUrl, dar fără
          // demo. Controller-ul nu expune nimic dacă lipsește demoAudioUrl.
          gen.audioUrl = mainSource;
          gen.demoAudioUrl = null;
        }
      }
      if (bonusSource) {
        try {
          const b = await this.audio.downloadAndMakeDemo(gen.id, bonusSource, 'bonus');
          gen.bonusAudioUrl = b.fullUrl;
          gen.demoBonusAudioUrl = b.demoUrl;
        } catch (err) {
          this.logger.warn(`audio processing failed for ${gen.id} (bonus): ${(err as Error).message}`);
          gen.bonusAudioUrl = bonusSource;
          gen.demoBonusAudioUrl = null;
        }
      }

      const def = packageDef(tier);
      const hasExtras =
        gen.type === 'full' && (def.instrumental || def.socialImage || def.video);

      // Melodia principală e gata → marcăm `succeeded` ACUM, ca să fie ascultabilă
      // imediat, FĂRĂ a aștepta extras-urile (instrumental/imagini/video). Acestea
      // se generează după și se atașează PROGRESIV (cu save după fiecare), iar
      // frontend-ul face polling până când `deliverablesReady` devine true.
      gen.status = 'succeeded';
      gen.completedAt = new Date();
      gen.nextRetryAt = null;
      gen.deliverablesReady = !hasExtras;
      await this.repo.save(gen);
      this.logger.log(`generation ${gen.id} succeeded with ${result.tracks.length} tracks`);

      if (hasExtras) {
        // ===== INSTRUMENTAL (plus / premium) — în fundal, după ce melodia e live =====
        if (def.instrumental) {
          try {
            const instr = await this.suno.generate({
              type: gen.type,
              durationSec: targetDuration,
              style: gen.style,
              occasion: gen.occasion,
              recipientName: gen.recipientName,
              message: gen.message,
              dedication: gen.dedication ?? undefined,
              voiceArtist: gen.voiceArtist,
              lyrics: sunoLyrics,
              lyricsAreCustom: !!gen.customLyrics?.trim(),
              generationId: gen.id,
              site: site ?? undefined,
              vocalGender,
              personaId: voiceEntry?.sunoPersonaId,
              styleWeight: styleEntry?.styleWeight,
              weirdnessConstraint: styleEntry?.weirdnessConstraint,
              negativeTags: styleEntry?.negativeTags,
              instrumental: true,
            });
            const instrSource = instr.tracks[0]?.audioUrl;
            if (instrSource) {
              try {
                const im = await this.audio.downloadAndMakeDemo(gen.id, instrSource, 'instrumental');
                gen.instrumentalUrl = im.fullUrl;
              } catch (err) {
                this.logger.warn(
                  `instrumental audio processing failed for ${gen.id}: ${(err as Error).message}`,
                );
                gen.instrumentalUrl = instrSource;
              }
            }
          } catch (err) {
            this.logger.warn(`instrumental generation failed for ${gen.id}: ${(err as Error).message}`);
          }
          await this.repo.save(gen); // apare imediat la polling
        }

        // ===== IMAGINI SOCIALE (plus / premium) =====
        if (def.socialImage) {
          try {
            gen.socialImages = await this.media.generateSocialImages(gen);
            gen.socialImageSelected = gen.socialImages[0] ?? null;
          } catch (err) {
            this.logger.warn(`social image generation failed for ${gen.id}: ${(err as Error).message}`);
          }
          await this.repo.save(gen);
        }

        // ===== VIDEO — clip SCURT stil TikTok din REFREN, pentru ambele piese =====
        if (def.video) {
          // Track 1 → clip.mp4 (full.mp3), Track 2 → clip2.mp4 (bonus.mp3).
          gen.videoUrl = await this.generateChorusClip(gen, {
            idx: 0,
            audioPath: `/app/uploads/audio/${gen.id}/full.mp3`,
            outName: 'clip.mp4',
          });
          if (gen.bonusAudioUrl) {
            gen.videoUrlBonus = await this.generateChorusClip(gen, {
              idx: 1,
              audioPath: `/app/uploads/audio/${gen.id}/bonus.mp3`,
              outName: 'clip2.mp4',
            });
          }
          await this.repo.save(gen);
        }

        gen.deliverablesReady = true;
        await this.repo.save(gen);
      }

      await this.notifyOwner(gen);
      void this.notifyChat(gen.id, 'succeeded');
    } catch (err) {
      gen.status = 'failed';
      gen.error = err instanceof Error ? err.message : String(err);
      gen.completedAt = new Date();
      gen.lastRetryAt = new Date();

      // Auto-retry când Suno cade: pentru orice generation cu payment plătit
      // (paidUnlocked sau type='full'), reîncercăm la nesfârșit cu backoff
      // exponențial până când reușește SAU admin încarcă manual fișierul.
      // Pentru demouri necontract-uite, ne oprim după câteva încercări.
      // IMPORTANT: auto-retry incrementează `autoRetryCount`, NU `retryCount`.
      // `retryCount` e rezervat butonului manual (limită 3) — dacă auto-retry-ul
      // ar fi atins același contor, butonul manual s-ar bloca permanent după
      // câteva eșecuri Suno. Vezi GenerationsService.retry().
      const maxRetries = this.maxAutoRetries(gen);
      const shouldAutoRetry = (gen.autoRetryCount ?? 0) < maxRetries;
      if (shouldAutoRetry) {
        gen.autoRetryCount = (gen.autoRetryCount ?? 0) + 1;
        const delayMs = this.nextRetryDelayMs(gen.autoRetryCount - 1);
        gen.nextRetryAt = new Date(Date.now() + delayMs);
        await this.repo.save(gen);
        await this.queue.add(
          'generate',
          { generationId: gen.id },
          { delay: delayMs, removeOnComplete: 100, removeOnFail: 100, attempts: 1 },
        );
        this.logger.warn(
          `generation ${gen.id} failed (auto-try #${gen.autoRetryCount}/${maxRetries}): ${gen.error}; auto-retry in ${Math.round(delayMs / 60_000)}min`,
        );
      } else {
        gen.nextRetryAt = null;
        await this.repo.save(gen);
        this.logger.error(
          `generation ${gen.id} failed permanently (auto-try ${gen.autoRetryCount}/${maxRetries}): ${gen.error}`,
        );
      }
      void this.notifyChat(gen.id, 'failed');
    }
  }

  /**
   * Procesează un job 'media-op' (unelte Suno admin): extend / cover (creează
   * un rând-copil variație cu audio nou) sau wav / separate / video (atașează
   * fișiere derivate în `mediaExtras` pe generarea-sursă).
   */
  private async processMediaOp(data: MediaOpJob): Promise<void> {
    const src = await this.repo.findOne({ where: { id: data.generationId } });
    if (!src) {
      this.logger.warn(`media-op: source generation ${data.generationId} not found`);
      return;
    }
    const idx = data.slot === 'bonus' ? 1 : 0;
    const audioId = src.tracks?.[idx]?.audioId;
    const taskId = src.providerJobId;
    const site = src.siteId ? await this.sites.findById(src.siteId) : null;

    try {
      if (data.op === 'extend' || data.op === 'cover' || data.op === 'replace') {
        const child = data.childId ? await this.repo.findOne({ where: { id: data.childId } }) : null;
        if (!child) {
          this.logger.warn(`media-op ${data.op}: child ${data.childId} not found`);
          return;
        }
        let result;
        if (data.op === 'extend') {
          if (!audioId) throw new Error('source has no Suno audioId for extend');
          result = await this.suno.extendMusic({
            audioId,
            continueAt: data.params?.continueAt as number | undefined,
            style: data.params?.style as string | undefined,
            generationId: child.id,
            siteId: child.siteId,
          });
        } else if (data.op === 'replace') {
          if (!audioId || !taskId || taskId === 'manual') {
            throw new Error('source has no Suno task/audioId for replace-section');
          }
          // Determină intervalul: explicit din params, altfel auto-detectează refrenul.
          let startS = data.params?.infillStartS as number | undefined;
          let endS = data.params?.infillEndS as number | undefined;
          if (data.params?.autoChorus || startS == null || endS == null) {
            const lyrics = await this.suno.getTimestampedLyrics(taskId, audioId);
            const seg = findChorusSegment(lyrics?.alignedWords);
            if (!seg) {
              throw new Error('Nu am putut detecta refrenul automat — specifică intervalul (de la–până la secundă).');
            }
            startS = seg.startSec;
            endS = seg.startSec + seg.durationSec;
          }
          result = await this.suno.replaceSection({
            taskId,
            audioId,
            infillStartS: startS,
            infillEndS: endS,
            tags: (data.params?.style as string | undefined) || undefined,
            prompt: (data.params?.prompt as string | undefined) || undefined,
            generationId: child.id,
            siteId: child.siteId,
          });
        } else {
          const uploadUrl = this.absoluteMediaUrl(src.audioUrl ?? src.demoAudioUrl);
          if (!uploadUrl) throw new Error('source has no audio URL for cover');
          result = await this.suno.coverMusic({
            uploadUrl,
            style: data.params?.style as string | undefined,
            instrumental: !!data.params?.instrumental,
            generationId: child.id,
            siteId: child.siteId,
          });
        }

        const mainSource = result.tracks[0]?.audioUrl;
        if (!mainSource) throw new Error('Suno returned no audio');
        const m = await this.audio.downloadAndMakeDemo(child.id, mainSource, 'full');
        child.audioUrl = m.fullUrl;
        child.demoAudioUrl = m.demoUrl;
        const bonusSource = result.tracks[1]?.audioUrl;
        if (bonusSource) {
          try {
            const b = await this.audio.downloadAndMakeDemo(child.id, bonusSource, 'bonus');
            child.bonusAudioUrl = b.fullUrl;
            child.demoBonusAudioUrl = b.demoUrl;
          } catch (err) {
            this.logger.warn(`media-op ${data.op} bonus dl failed: ${(err as Error).message}`);
          }
        }
        child.tracks = result.tracks;
        child.coverUrl = result.tracks[0]?.coverUrl ?? null;
        child.providerJobId = result.providerJobId;
        child.lyrics = result.lyrics ?? child.lyrics;
        child.status = 'succeeded';
        child.completedAt = new Date();
        child.deliverablesReady = true;
        await this.repo.save(child);
        this.logger.log(`media-op ${data.op} done → variation ${child.id}`);
        return;
      }

      // Operații care atașează fișiere derivate pe generarea-sursă.
      if (!taskId || taskId === 'manual' || !audioId) {
        throw new Error('source has no Suno task/audio for derived op');
      }
      const slotKey = data.slot === 'bonus' ? 'bonus' : 'main';

      if (data.op === 'wav') {
        const wavUrl = await this.suno.convertToWav(taskId, audioId);
        if (wavUrl) {
          await this.patchMediaExtras(src.id, (e) => {
            if (slotKey === 'bonus') e.wavBonusUrl = wavUrl;
            else e.wavUrl = wavUrl;
          });
        }
      } else if (data.op === 'separate') {
        const type = (data.params?.type as 'separate_vocal' | 'split_stem') ?? 'separate_vocal';
        const res = await this.suno.separateVocals(taskId, audioId, type);
        if (res) {
          await this.patchMediaExtras(src.id, (e) => {
            if (res.stems) e.stems = { ...(e.stems ?? {}), ...res.stems };
            if (res.vocalUrl) e.vocalUrl = res.vocalUrl;
            if (res.instrumentalUrl) e.accompanimentUrl = res.instrumentalUrl;
          });
        }
      } else if (data.op === 'video') {
        const videoUrl = await this.suno.createMusicVideo(taskId, audioId, {
          author: site?.name ?? undefined,
          domainName: site?.domain ?? undefined,
        });
        if (videoUrl) {
          await this.patchMediaExtras(src.id, (e) => {
            if (slotKey === 'bonus') e.musicVideoBonusUrl = videoUrl;
            else e.musicVideoUrl = videoUrl;
          });
        }
      }
      this.logger.log(`media-op ${data.op} done for ${src.id}`);
    } catch (err) {
      this.logger.error(`media-op ${data.op} failed for ${data.generationId}: ${(err as Error).message}`);
      if (data.childId) {
        await this.repo
          .update({ id: data.childId }, { status: 'failed', error: (err as Error).message, completedAt: new Date() })
          .catch(() => {});
      }
    }
  }

  /**
   * Job „upgrade-deliverables" — după un upgrade de pachet din admin pe o piesă
   * deja generată: produce DOAR livrabilele lipsă ale noului tier (imagini
   * social, videoclipuri refren), fără să atingă audio-ul. Instrumentalul e
   * sărit intenționat — niciun tier actual nu-l include, iar generarea lui ar
   * cere un apel Suno complet. La final `deliverablesReady` devine true
   * indiferent de eșecuri parțiale (fiecare pas e best-effort, ca în fluxul
   * normal de generare).
   */
  private async processUpgradeDeliverables(generationId: string): Promise<void> {
    const gen = await this.repo.findOne({ where: { id: generationId } });
    if (!gen) {
      this.logger.warn(`upgrade-deliverables: generation ${generationId} not found`);
      return;
    }
    const def = packageDef(normalizeTier(gen.packageTier));
    try {
      if (def.socialImage && (gen.socialImages?.length ?? 0) === 0) {
        try {
          gen.socialImages = await this.media.generateSocialImages(gen);
          gen.socialImageSelected = gen.socialImageSelected ?? gen.socialImages[0] ?? null;
        } catch (err) {
          this.logger.warn(`upgrade social images failed for ${gen.id}: ${(err as Error).message}`);
        }
        await this.repo.save(gen);
      }

      if (def.video && !gen.videoUrl) {
        gen.videoUrl = await this.generateChorusClip(gen, {
          idx: 0,
          audioPath: `/app/uploads/audio/${gen.id}/full.mp3`,
          outName: 'clip.mp4',
        });
        if (gen.bonusAudioUrl && !gen.videoUrlBonus) {
          gen.videoUrlBonus = await this.generateChorusClip(gen, {
            idx: 1,
            audioPath: `/app/uploads/audio/${gen.id}/bonus.mp3`,
            outName: 'clip2.mp4',
          });
        }
        await this.repo.save(gen);
      }
      this.logger.log(`upgrade-deliverables done for ${gen.id} (tier=${gen.packageTier})`);
    } finally {
      gen.deliverablesReady = true;
      await this.repo.save(gen);
    }
  }

  /** Citește-modifică-scrie `mediaExtras` atomic (best-effort) pentru a evita clobber. */
  private async patchMediaExtras(
    generationId: string,
    mutate: (e: NonNullable<Generation['mediaExtras']>) => void,
  ): Promise<void> {
    const fresh = await this.repo.findOne({ where: { id: generationId } });
    if (!fresh) return;
    const extras = { ...(fresh.mediaExtras ?? {}) };
    mutate(extras);
    fresh.mediaExtras = extras;
    await this.repo.save(fresh);
  }

  /** Construiește URL public absolut dintr-un path relativ `/uploads/...`. */
  private absoluteMediaUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const clean = url.replace(/\?v=\d+$/, '');
    if (/^https?:\/\//.test(clean)) return clean;
    const base = (this.config.get<string>('APP_URL') ?? 'http://localhost:1500').replace(/\/$/, '');
    return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
  }

  async notifyOwner(gen: Generation): Promise<void> {
    // Refetch din DB — gen-ul în memorie poate avea paidUnlocked stale dacă
    // userul a plătit între pickup-ul job-ului și terminarea Suno (Stripe webhook
    // rulează concurrent cu worker-ul). Vrem să trimitem emailul corect (demo vs full).
    const fresh = await this.repo.findOne({ where: { id: gen.id } });
    if (fresh) gen = fresh;

    let email: string | null = null;
    if (gen.ownerUserId) {
      const u = await this.users.findOne({ where: { id: gen.ownerUserId } });
      email = u?.email ?? null;
    } else if (gen.ownerGuestId) {
      const g = await this.guests.findOne({ where: { id: gen.ownerGuestId } });
      email = g?.email ?? null;
    }
    if (!email) return;

    // Folosim locale-ul site-ului dacă există (mail-ul e în limba brand-ului).
    const site = gen.siteId ? await this.sites.findById(gen.siteId) : null;
    const branding = brandingFromSite(site);
    const baseUrl = branding?.siteUrl ?? this.config.get<string>('APP_URL') ?? 'http://localhost:1500';
    const link = `${baseUrl}/m/${gen.id}`;
    // Pentru email: tratăm `paidUnlocked` ca full (demo deblocat prin plată
    // sau cod cadou = melodie completă). Altfel template-ul ar afișa
    // „Maneaua ta demo (30s)" + cardul „Oferta 1+1 GRATIS" pentru un user
    // care a plătit deja — confuz și greșit. Pentru audio: dacă e paidUnlocked,
    // expunem audioUrl-ul complet în email; altfel doar link-ul demo.
    const effectiveType: 'demo' | 'full' = gen.type === 'full' || gen.paidUnlocked ? 'full' : 'demo';

    // Parolă auto (PIN 4 cifre) pentru conținutul privat — doar la pachetele care
    // pot avea poze custom / colaje (plus/premium), livrate (full). O setăm o
    // singură dată (dacă owner-ul n-a pus deja una) și o includem în email.
    let unlockPin: string | null = null;
    if (effectiveType === 'full' && (gen.packageTier === 'plus' || gen.packageTier === 'premium')) {
      if (gen.unlockPasswordHash) {
        unlockPin = gen.unlockPin ?? null;
      } else {
        const pin = generateSharePin();
        await this.repo
          .update({ id: gen.id }, { unlockPin: pin, unlockPasswordHash: hashUnlock(gen.id, pin) })
          .catch(() => {});
        unlockPin = pin;
      }
    }

    // Cod de fidelizare „next order": 40% reducere la următoarea manea, valabil 24h,
    // o singură utilizare, legat de emailul clientului. DOAR pe melodia completă
    // (full/paid) — pe demo rămâne CTA-ul de upgrade existent, ca să nu canibalizăm
    // prima vânzare. Idempotent pe gen.id (dedupeNote), deci re-trimiterea emailului
    // (retry worker) nu creează coduri multiple. Eșecul emiterii NU blochează mailul.
    const NEXT_ORDER_DISCOUNT_PERCENT = 40;
    const NEXT_ORDER_DISCOUNT_HOURS = 24;
    let discountCode: string | null = null;
    if (effectiveType === 'full') {
      try {
        const promo = await this.promo.issueNextOrderDiscount({
          siteId: gen.siteId ?? null,
          email,
          percent: NEXT_ORDER_DISCOUNT_PERCENT,
          validHours: NEXT_ORDER_DISCOUNT_HOURS,
          dedupeNote: `post_generation gen:${gen.id}`,
        });
        discountCode = promo.code;
      } catch (err) {
        this.logger.warn(
          `notifyOwner: nu am putut emite codul de reducere pentru gen ${gen.id}: ${(err as Error).message}`,
        );
      }
    }

    const tpl = generationReadyTemplate({
      recipientName: gen.recipientName,
      type: effectiveType,
      link,
      audioUrl: effectiveType === 'full' ? gen.audioUrl : gen.demoAudioUrl,
      // Livrabile extra pachete (doar pentru full/paid). Relative URLs sunt OK —
      // socialImage/video pot fi deja absolute (uploads service le prefixează cu API_URL).
      socialImageUrl: effectiveType === 'full' ? gen.socialImageSelected : null,
      instrumentalUrl: effectiveType === 'full' ? gen.instrumentalUrl : null,
      videoUrl: effectiveType === 'full' ? gen.videoUrl : null,
      unlockPin,
      discountCode,
      discountPercent: NEXT_ORDER_DISCOUNT_PERCENT,
      discountValidHours: NEXT_ORDER_DISCOUNT_HOURS,
      orderUrl: baseUrl,
      locale: site?.locale ?? gen.locale ?? 'ro',
      branding,
    });
    // Eșecul notificării NU trebuie să pice job-ul (altfel BullMQ ar reîncerca și
    // ar regenera melodia + livrabilele = cost dublu la Suno). Melodia e deja gata.
    try {
      await this.mailer.send(
        {
          to: email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          from: site?.fromEmail ?? undefined,
        },
        { site, kind: 'generation_ready', userId: gen.ownerUserId ?? null, relatedId: gen.id },
      );
    } catch (err) {
      this.logger.warn(
        `notifyOwner mail failed for gen ${gen.id}: ${(err as Error).message}`,
      );
    }
  }
}
