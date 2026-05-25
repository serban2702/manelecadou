import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';

import { Generation } from './generation.entity';
import { GENERATIONS_QUEUE } from './generations.service';
import { SunoProvider } from '../suno/suno.types';
import { LyricsService } from '../lyrics/lyrics.module';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { User } from '../users/user.entity';
import { MailerService } from '../../mailer/mailer.module';
import { generationReadyTemplate } from '../../mailer/templates/templates';
import { brandingFromSite } from '../../mailer/branding';
import { SitesService } from '../sites/sites.service';
import { AudioProcessorService } from './audio-processor.service';

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
    private readonly moduleRef: ModuleRef,
  ) {
    super();
  }

  /** Lazy notification către ChatService — apelat după ce generation termină
   *  (succes sau eșec). Lazy load pentru a evita dependency circular între
   *  GenerationsModule și ChatModule (chat importă payments care importă generations). */
  private async notifyChat(generationId: string, status: 'succeeded' | 'failed'): Promise<void> {
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

      const result = await this.suno.generate({
        type: gen.type,
        durationSec: gen.durationSec,
        style: gen.style,
        occasion: gen.occasion,
        recipientName: gen.recipientName,
        message: gen.message,
        dedication: gen.dedication ?? undefined,
        voiceArtist: gen.voiceArtist,
        lyrics: refined,
        generationId: gen.id,
        site: site ?? undefined,
        vocalGender: voiceEntry?.gender,
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

      gen.status = 'succeeded';
      gen.completedAt = new Date();
      await this.repo.save(gen);
      this.logger.log(`generation ${gen.id} succeeded with ${result.tracks.length} tracks`);

      await this.notifyOwner(gen);
      void this.notifyChat(gen.id, 'succeeded');
    } catch (err) {
      gen.status = 'failed';
      gen.error = err instanceof Error ? err.message : String(err);
      gen.completedAt = new Date();
      await this.repo.save(gen);
      this.logger.error(`generation ${gen.id} failed: ${gen.error}`);
      void this.notifyChat(gen.id, 'failed');
    }
  }

  private async notifyOwner(gen: Generation): Promise<void> {
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
    const tpl = generationReadyTemplate({
      recipientName: gen.recipientName,
      type: gen.type,
      link,
      audioUrl: gen.audioUrl,
      locale: site?.locale ?? gen.locale ?? 'ro',
      branding,
    });
    await this.mailer.send(
      {
        to: email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        from: site?.fromEmail ?? undefined,
      },
      { site },
    );
  }
}
