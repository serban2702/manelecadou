import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job, Queue } from 'bullmq';

import { Generation } from './generation.entity';
import { GENERATIONS_QUEUE } from './generations.constants';
import { voiceArtistToGender } from '../../common/voice';
import { SunoProvider } from '../suno/suno.types';
import { LyricsService } from '../lyrics/lyrics.module';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { User } from '../users/user.entity';
import { MailerService } from '../../mailer/mailer.module';
import { generationReadyTemplate } from '../../mailer/templates/templates';
import { brandingFromSite } from '../../mailer/branding';
import { SitesService } from '../sites/sites.service';
import { AudioProcessorService } from './audio-processor.service';
import { GenerationMediaService } from '../media/generation-media.service';
import { normalizeTier, packageDef } from '../payments/packages';

@Processor(GENERATIONS_QUEUE)
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

  async process(job: Job<{ generationId: string }>): Promise<void> {
    const { generationId } = job.data;
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
        lyrics: refined,
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

      // ===== INSTRUMENTAL (plus / premium) =====
      // După ce melodia principală e gata, lansăm o generare instrumentală
      // separată (Suno cu instrumental:true, același style/voce). Robust:
      // eșecul NU pică melodia principală.
      if (def.instrumental && gen.type === 'full') {
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
            lyrics: refined,
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
      }

      // ===== MEDIA (imagine socială + video) =====
      // Graceful — eșecul NU pică livrarea. media.* sunt furnizate de MediaModule.
      if (def.socialImage && gen.type === 'full') {
        try {
          gen.socialImages = await this.media.generateSocialImages(gen);
          gen.socialImageSelected = gen.socialImages[0] ?? null;
        } catch (err) {
          this.logger.warn(`social image generation failed for ${gen.id}: ${(err as Error).message}`);
        }
      }
      if (def.video && gen.type === 'full') {
        try {
          gen.videoUrl = await this.media.generateVideo(gen);
        } catch (err) {
          this.logger.warn(`video generation failed for ${gen.id}: ${(err as Error).message}`);
        }
      }

      gen.status = 'succeeded';
      gen.completedAt = new Date();
      gen.nextRetryAt = null;
      await this.repo.save(gen);
      this.logger.log(`generation ${gen.id} succeeded with ${result.tracks.length} tracks`);

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
      const maxRetries = this.maxAutoRetries(gen);
      const shouldAutoRetry = (gen.retryCount ?? 0) < maxRetries;
      if (shouldAutoRetry) {
        gen.retryCount = (gen.retryCount ?? 0) + 1;
        const delayMs = this.nextRetryDelayMs(gen.retryCount - 1);
        gen.nextRetryAt = new Date(Date.now() + delayMs);
        await this.repo.save(gen);
        await this.queue.add(
          'generate',
          { generationId: gen.id },
          { delay: delayMs, removeOnComplete: 100, removeOnFail: 100, attempts: 1 },
        );
        this.logger.warn(
          `generation ${gen.id} failed (try #${gen.retryCount}/${maxRetries}): ${gen.error}; auto-retry in ${Math.round(delayMs / 60_000)}min`,
        );
      } else {
        gen.nextRetryAt = null;
        await this.repo.save(gen);
        this.logger.error(
          `generation ${gen.id} failed permanently (try ${gen.retryCount}/${maxRetries}): ${gen.error}`,
        );
      }
      void this.notifyChat(gen.id, 'failed');
    }
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
