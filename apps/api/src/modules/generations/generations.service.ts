import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ModuleRef } from '@nestjs/core';

import { Generation } from './generation.entity';
import { AudioProcessorService } from './audio-processor.service';
import { GenerationsProcessor } from './generations.processor';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { User } from '../users/user.entity';
import { Payment } from '../payments/payment.entity';
import { CreateGenerationDto } from './dto/create-generation.dto';
import { MailerService } from '../../mailer/mailer.module';
import { paymentSuccessTemplate } from '../../mailer/templates/templates';
import { brandingFromSite } from '../../mailer/branding';
import { SitesService } from '../sites/sites.service';
import { isPackageTier, normalizeTier, packageDef } from '../payments/packages';
import { resolvePackageDef, snapshotFromDef } from '../experiences/package-resolve';
import { DEFAULT_EXPERIENCE_SLUG } from '../experiences/catalog';
import { hashUnlock, verifyUnlock } from '../../common/unlock';

export { GENERATIONS_QUEUE } from './generations.constants';
import { GENERATIONS_QUEUE } from './generations.constants';

/** Câmpuri editabile la regenerare din admin. */
export interface AdminRegenerateEdits {
  recipientName?: string;
  dedication?: string | null;
  message?: string;
  style?: string;
  occasion?: string;
  voiceArtist?: string;
  packageTier?: string;
}

export type AdminRegenerateTarget = 'overwrite' | 'new_track' | 'new_order';
export type AdminRegenerateLyricsMode = 'rewrite' | 'keep' | 'custom';

export interface AdminRegenerateInput {
  target: AdminRegenerateTarget;
  /** rewrite (AI scrie din câmpuri) | keep (refolosește versurile actuale) | custom (text dat). */
  lyricsMode?: AdminRegenerateLyricsMode;
  customLyrics?: string;
  edits?: AdminRegenerateEdits;
  /** Etichetă pentru variație (target=new_track). */
  label?: string;
}

/** Payload pentru job-urile 'media-op' procesate de GenerationsProcessor. */
export interface MediaOpJob {
  op: 'extend' | 'cover' | 'replace' | 'wav' | 'separate' | 'video';
  /** Generarea-sursă (existentă, succeeded) pe care operăm. */
  generationId: string;
  /** Pentru extend/cover: rândul-copil pre-creat care va primi audio-ul. */
  childId?: string;
  slot?: 'main' | 'bonus';
  params?: Record<string, unknown>;
}

/** Scoate sufixul de cache-bust (`?v=...`) ca să nu se acumuleze la swap/promote. */
export function stripCacheBust(url: string): string {
  return url.replace(/\?v=\d+$/, '');
}

@Injectable()
export class GenerationsService {
  private readonly logger = new Logger('GenerationsService');

  constructor(
    @InjectRepository(Generation) private readonly repo: Repository<Generation>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(GuestSession) private readonly guests: Repository<GuestSession>,
    @InjectQueue(GENERATIONS_QUEUE) private readonly queue: Queue,
    private readonly dataSource: DataSource,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly sites: SitesService,
    private readonly audio: AudioProcessorService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async create(
    dto: CreateGenerationDto,
    ctx: { userId: string | null; guestId: string | null; siteId?: string | null; experienceSlug?: string | null },
  ): Promise<Generation> {
    if (!ctx.userId && !ctx.guestId) {
      throw new ForbiddenException('Missing guest session');
    }

    const saved = await this.dataSource.transaction(async (mgr) => {
      const generationRepo = mgr.getRepository(Generation);

      if (dto.type === 'demo') {
        // Marcăm flag-ul pentru telemetrie/raportare, dar NU mai blocăm a doua generare.
        if (ctx.userId) {
          const user = await mgr.getRepository(User).findOne({ where: { id: ctx.userId } });
          if (!user) throw new NotFoundException('User not found');
          if (!user.freeDemoUsed) {
            user.freeDemoUsed = true;
            await mgr.getRepository(User).save(user);
          }
        } else if (ctx.guestId) {
          const guest = await mgr
            .getRepository(GuestSession)
            .findOne({ where: { id: ctx.guestId } });
          if (!guest) throw new NotFoundException('Guest session not found');
          if (!guest.email) throw new ForbiddenException('email_required');
          if (!guest.freeDemoUsed) {
            guest.freeDemoUsed = true;
            await mgr.getRepository(GuestSession).save(guest);
          }
        }
      } else {
        if (!dto.paymentId) throw new ForbiddenException('paymentId required for full generation');
        const payment = await mgr.getRepository(Payment).findOne({ where: { id: dto.paymentId } });
        if (!payment || payment.status !== 'paid') {
          throw new ForbiddenException('payment not confirmed');
        }
      }

      const tier = normalizeTier(dto.packageTier);
      const site = ctx.siteId ? await this.sites.findById(ctx.siteId) : null;
      const expSlug = ctx.experienceSlug || DEFAULT_EXPERIENCE_SLUG;
      const adminPkg = site?.experienceConfig?.items?.[expSlug]?.packages?.[tier] ?? null;
      const resolved = resolvePackageDef(tier, expSlug, adminPkg);
      const snap = snapshotFromDef(resolved);
      const guest = ctx.guestId
        ? await mgr.getRepository(GuestSession).findOne({ where: { id: ctx.guestId } })
        : null;
      const created = generationRepo.create({
        ownerUserId: ctx.userId,
        ownerGuestId: ctx.userId ? null : ctx.guestId,
        type: dto.type,
        status: 'queued',
        // Demo rămâne scurt; pentru full folosim durata pachetului (premium = 150s).
        durationSec: dto.type === 'demo' ? 30 : snap.durationSec,
        experienceSlug: expSlug,
        packageSnapshot: snap,
        personId: guest?.personId ?? null,
        style: dto.style,
        occasion: dto.occasion,
        recipientName: dto.recipientName,
        message: dto.message,
        dedication: dto.dedication ?? null,
        voiceArtist: dto.voiceArtist,
        customLyrics: dto.customLyrics ?? null,
        tipAmount: dto.tipAmount ?? 0,
        premium: dto.premium ?? false,
        packageTier: tier,
        paymentId: dto.paymentId ?? null,
        locale: dto.locale ?? 'ro',
        siteId: ctx.siteId ?? null,
      });
      return generationRepo.save(created);
    });

    // IMPORTANT: queue.add se face DUPĂ commit-ul tranzacției — altfel worker-ul
    // BullMQ poate prelua job-ul înainte ca generation să fie persistat și
    // primește „generation not found".
    await this.queue.add(
      'generate',
      { generationId: saved.id },
      {
        removeOnComplete: 100,
        removeOnFail: 100,
        // Suno poate dura 2-4 min; lăsăm 8 min ca să nu eșueze prematur
        attempts: 1,
      },
    );

    return saved;
  }

  async findOne(
    id: string,
    ctx: { userId: string | null; guestId: string | null },
  ): Promise<Generation> {
    const g = await this.repo.findOne({ where: { id } });
    if (!g) throw new NotFoundException('Generation not found');
    if (g.ownerUserId && g.ownerUserId === ctx.userId) return g;
    if (g.ownerGuestId && g.ownerGuestId === ctx.guestId) return g;
    throw new ForbiddenException('Not your generation');
  }

  async findOnePublic(id: string): Promise<Generation | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Emailul ownerului unei generări (user logat sau guest), rezolvat din
   * owner ids. Folosit la reluarea plății dintr-un alt device/browser fără
   * sesiunea owner (ex. link de recovery) ca un cod promo restricționat pe
   * email să se poată valida. Întoarce `null` dacă nu există owner cu email.
   */
  async resolveOwnerEmail(generationId: string): Promise<string | null> {
    const gen = await this.repo.findOne({
      where: { id: generationId },
      select: { id: true, ownerUserId: true, ownerGuestId: true },
    });
    if (!gen) return null;
    if (gen.ownerUserId) {
      const u = await this.users.findOne({ where: { id: gen.ownerUserId } });
      if (u?.email) return u.email;
    }
    if (gen.ownerGuestId) {
      const g = await this.guests.findOne({ where: { id: gen.ownerGuestId } });
      if (g?.email) return g.email;
    }
    return null;
  }

  /**
   * Lista variantelor REDABILE pe pagina publică /m/<id>, în ordinea afișării:
   * piesa principală (main + bonus) + toate variațiile-copil succeeded. Dedup pe
   * path normalizat (o variație promovată în principală nu apare de două ori).
   * Întoarce demo sau full în funcție de plată — nu scurge full-ul către neplătiți.
   */
  async listPlayableVariants(
    gen: Generation,
    isPaid: boolean,
  ): Promise<Array<{ id: string; kind: 'main' | 'bonus' | 'variation'; label: string; audioUrl: string }>> {
    const out: Array<{ id: string; kind: 'main' | 'bonus' | 'variation'; label: string; audioUrl: string }> = [];
    const seen = new Set<string>();
    const push = (
      id: string,
      kind: 'main' | 'bonus' | 'variation',
      label: string,
      url: string | null | undefined,
    ) => {
      if (!url) return;
      const key = stripCacheBust(url);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ id, kind, label, audioUrl: url });
    };
    push(gen.id, 'main', gen.variationLabel ?? 'Principală', isPaid ? gen.audioUrl : gen.demoAudioUrl);
    push(gen.id, 'bonus', 'Bonus', isPaid ? gen.bonusAudioUrl : gen.demoBonusAudioUrl);
    const variations = await this.repo.find({
      where: { parentGenerationId: gen.id, status: 'succeeded' },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
      take: 50,
    });
    for (const v of variations) {
      push(v.id, 'variation', v.variationLabel ?? 'Variație', isPaid ? v.audioUrl : v.demoAudioUrl);
    }
    return out;
  }

  /**
   * Scoate de pe pagina clientului piesa principală (`main`) sau bonusul
   * (`bonus`) — golește slotul (audio + demo). Folosit ca admin să șteargă de pe
   * pagină variantele „deja generate" (originalele Suno), păstrând doar ce vrea.
   */
  async adminClearSlot(generationId: string, slot: 'main' | 'bonus'): Promise<Generation> {
    const gen = await this.repo.findOne({ where: { id: generationId } });
    if (!gen) throw new NotFoundException('Generation not found');
    if (slot === 'main') {
      gen.audioUrl = null;
      gen.demoAudioUrl = null;
    } else {
      gen.bonusAudioUrl = null;
      gen.demoBonusAudioUrl = null;
    }
    const saved = await this.repo.save(gen);
    this.logger.warn(`[admin-clear-slot] generation=${saved.id} slot=${slot}`);
    return saved;
  }

  /** Owner setează (sau șterge cu password=null/'') parola de deblocare a
   *  conținutului privat (poze custom + colaje). Doar owner-ul (findOne throws). */
  async setUnlockPassword(
    id: string,
    ctx: { userId: string | null; guestId: string | null },
    password: string | null,
  ): Promise<{ ok: true; hasPassword: boolean; pin: string | null }> {
    const g = await this.findOne(id, ctx); // aruncă dacă nu e owner
    const pwd = (password ?? '').trim();
    g.unlockPasswordHash = pwd ? hashUnlock(g.id, pwd) : null;
    g.unlockPin = pwd ? pwd : null; // păstrăm și în clar pt afișare owner
    await this.repo.save(g);
    return { ok: true, hasPassword: !!g.unlockPasswordHash, pin: g.unlockPin };
  }

  /** Verifică o parolă de deblocare pentru o manea (vizitator non-owner). */
  async checkUnlock(id: string, password: string): Promise<boolean> {
    const g = await this.repo.findOne({ where: { id } });
    if (!g) return false;
    return verifyUnlock(g.id, password, g.unlockPasswordHash);
  }

  async countMine(ctx: { userId: string | null; guestId: string | null }): Promise<number> {
    if (ctx.userId) return this.repo.count({ where: { ownerUserId: ctx.userId } });
    if (ctx.guestId) return this.repo.count({ where: { ownerGuestId: ctx.guestId } });
    return 0;
  }

  /** Count global. siteId === null = cross-site (admin „Toate"). */
  async countAll(siteId: string | null = null): Promise<number> {
    return this.repo.count({ where: siteId ? { siteId } : {} });
  }

  async listMine(ctx: { userId: string | null; guestId: string | null }) {
    if (ctx.userId) {
      return this.repo.find({
        where: { ownerUserId: ctx.userId },
        order: { createdAt: 'DESC' },
        take: 50,
      });
    }
    if (ctx.guestId) {
      return this.repo.find({
        where: { ownerGuestId: ctx.guestId },
        order: { createdAt: 'DESC' },
        take: 50,
      });
    }
    return [];
  }

  async listRecent(limit = 12, siteId: string | null = null) {
    // Doar piesele complete sau cele al căror demo a fost deblocat prin plată/cadou
    // apar în listele publice. Demourile neplătite rămân private pentru proprietar.
    const qb = this.repo
      .createQueryBuilder('g')
      .where('g.status = :status', { status: 'succeeded' })
      .andWhere('(g.type = :full OR g.paidUnlocked = true)', { full: 'full' });
    if (siteId) qb.andWhere('g."siteId" = :siteId', { siteId });
    return qb.orderBy('g.createdAt', 'DESC').take(Math.min(limit, 50)).getMany();
  }

  async listPublic(opts: {
    style?: string;
    occasion?: string;
    voice?: string;
    period?: 'week' | 'month' | 'all';
    sort?: 'recent' | 'popular';
    limit?: number;
    offset?: number;
    siteId?: string | null;
  }): Promise<{ items: Generation[]; total: number }> {
    const qb = this.repo
      .createQueryBuilder('g')
      .where('g.status = :status', { status: 'succeeded' })
      // Galeria publică NU expune demouri neplătite — doar piesele complete sau
      // cele cu paidUnlocked=true (deblocate prin plată sau cod cadou).
      .andWhere('(g.type = :full OR g.paidUnlocked = true)', { full: 'full' })
      // Pachetele plus/premium NU apar în galeria/istoricul public al comunității
      // (intimitate pentru clienții care plătesc nivelurile superioare).
      .andWhere('(g."packageTier" IS NULL OR g."packageTier" = :basicTier)', { basicTier: 'basic' });

    if (opts.siteId) qb.andWhere('g."siteId" = :siteId', { siteId: opts.siteId });
    if (opts.style) qb.andWhere('g.style = :style', { style: opts.style });
    if (opts.occasion) qb.andWhere('g.occasion = :occasion', { occasion: opts.occasion });
    if (opts.voice) qb.andWhere('g.voiceArtist = :voice', { voice: opts.voice });

    if (opts.period === 'week') {
      qb.andWhere('g.createdAt >= NOW() - INTERVAL \'7 days\'');
    } else if (opts.period === 'month') {
      qb.andWhere('g.createdAt >= NOW() - INTERVAL \'30 days\'');
    }

    if (opts.sort === 'popular') {
      qb.orderBy('g.viewCount', 'DESC').addOrderBy('g.createdAt', 'DESC');
    } else {
      qb.orderBy('g.createdAt', 'DESC');
    }

    const limit = Math.min(Math.max(opts.limit ?? 24, 1), 300);
    const offset = Math.max(opts.offset ?? 0, 0);
    qb.take(limit).skip(offset);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async incrementViewCount(id: string): Promise<void> {
    await this.repo.increment({ id }, 'viewCount', 1);
  }

  /**
   * Top tracks pentru pagina /top — agregare după viewCount în fereastra cerută.
   * Doar generări `succeeded` care sunt vizibile public (full sau demo deblocat).
   */
  async listTop(opts: {
    siteId: string | null;
    period?: 'week' | 'month' | 'all';
    limit?: number;
  }): Promise<Generation[]> {
    const qb = this.repo
      .createQueryBuilder('g')
      .where('g.status = :status', { status: 'succeeded' })
      .andWhere('(g.type = :full OR g.paidUnlocked = true)', { full: 'full' })
      // Pachetele plus/premium NU apar în galeria/istoricul public al comunității
      // (intimitate pentru clienții care plătesc nivelurile superioare).
      .andWhere('(g."packageTier" IS NULL OR g."packageTier" = :basicTier)', { basicTier: 'basic' });
    if (opts.siteId) qb.andWhere('g."siteId" = :siteId', { siteId: opts.siteId });
    if (opts.period === 'week') {
      qb.andWhere('g."createdAt" >= NOW() - INTERVAL \'7 days\'');
    } else if (opts.period === 'month') {
      qb.andWhere('g."createdAt" >= NOW() - INTERVAL \'30 days\'');
    }
    const limit = Math.min(Math.max(opts.limit ?? 5, 1), 50);
    return qb
      .orderBy('g.viewCount', 'DESC')
      .addOrderBy('g."createdAt"', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * Re-rulează pipeline-ul de generare pentru o generare existentă (eșuată sau
   * blocată). Resetează status, eroare și URL-urile audio, apoi re-enqueue
   * job-ul. Permis doar pentru owner. Limită implicită: max 3 reîncercări.
   */
  async retry(
    generationId: string,
    ctx: { userId: string | null; guestId: string | null },
  ): Promise<Generation> {
    const gen = await this.repo.findOne({ where: { id: generationId } });
    if (!gen) throw new NotFoundException('Generation not found');
    const ownerOk =
      (gen.ownerUserId && gen.ownerUserId === ctx.userId) ||
      (gen.ownerGuestId && gen.ownerGuestId === ctx.guestId);
    if (!ownerOk) throw new ForbiddenException('Not your generation');

    if (gen.status === 'queued' || gen.status === 'writing_lyrics' ||
        gen.status === 'checking_lyrics' || gen.status === 'generating_audio') {
      throw new ConflictException('already_running');
    }
    if (gen.status === 'succeeded') {
      throw new ConflictException('already_succeeded');
    }

    // Limita se aplică DOAR reîncercărilor manuale. Auto-retry-urile (Suno
    // căzut / fără credite) folosesc `autoRetryCount` și NU consumă din asta —
    // altfel butonul s-ar bloca permanent după câteva eșecuri Suno.
    const max = 3;
    if ((gen.retryCount ?? 0) >= max) {
      throw new ForbiddenException('retry_limit_reached');
    }

    gen.status = 'queued';
    gen.error = null;
    gen.audioUrl = null;
    gen.bonusAudioUrl = null;
    gen.coverUrl = null;
    gen.tracks = [];
    gen.providerJobId = null;
    gen.completedAt = null;
    gen.retryCount = (gen.retryCount ?? 0) + 1;
    // Resetăm contorul auto-retry + marker-ul: după un retry manual, dacă Suno
    // tot e indisponibil, auto-retry-ul primește din nou tot bugetul de încercări.
    gen.autoRetryCount = 0;
    gen.nextRetryAt = null;
    const saved = await this.repo.save(gen);

    await this.queue.add(
      'generate',
      { generationId: saved.id },
      { removeOnComplete: 100, removeOnFail: 100, attempts: 1 },
    );

    return saved;
  }

  /**
   * Admin manual upload: cazul în care admin generează melodia pe Suno EXTERN
   * (UI-ul nativ Suno) și încarcă cele 2 versiuni direct, sărind peste pipeline-ul
   * automat (lyrics + suno API). Folosit când Suno API e instabil sau când admin
   * vrea control complet asupra rezultatului.
   *
   * Salvează `main.mp3` (obligatoriu) și optional `bonus.mp3`, generează demo-uri
   * (30s + fade-out) pentru fiecare, setează status='succeeded', marchează
   * `paidUnlocked` dacă deja era plătită (nu se schimbă, doar se păstrează),
   * apoi rulează notify-ul standard (email owner + chat WS).
   */
  async adminManualUpload(
    generationId: string,
    mainBuffer: Buffer,
    bonusBuffer: Buffer | null,
  ): Promise<Generation> {
    const gen = await this.repo.findOne({ where: { id: generationId } });
    if (!gen) throw new NotFoundException('Generation not found');
    if (!mainBuffer || mainBuffer.length === 0) {
      throw new ConflictException('main_file_required');
    }

    // 1. Salvăm fișierul principal + demo
    const main = await this.audio.saveAndMakeDemo(gen.id, mainBuffer, 'full');
    // Cache-bust: path-ul fizic e mereu același (full.mp3), deci la re-upload
    // browserul + Caddy ar servi varianta cache-uită. Adăugăm ?v=<timestamp>
    // pentru a forța reload-ul oriunde URL-ul e folosit (player, download, share).
    const v = Date.now();
    gen.audioUrl = `${main.fullUrl}?v=${v}`;
    gen.demoAudioUrl = `${main.demoUrl}?v=${v}`;

    // 2. Bonus opțional
    if (bonusBuffer && bonusBuffer.length > 0) {
      const bonus = await this.audio.saveAndMakeDemo(gen.id, bonusBuffer, 'bonus');
      gen.bonusAudioUrl = `${bonus.fullUrl}?v=${v}`;
      gen.demoBonusAudioUrl = `${bonus.demoUrl}?v=${v}`;
    } else {
      gen.bonusAudioUrl = null;
      gen.demoBonusAudioUrl = null;
    }

    // 3. Marker — providerJobId 'manual' ca să fie ușor de filtrat în /generations
    gen.providerJobId = 'manual';
    gen.tracks = [
      { audioUrl: gen.audioUrl!, durationSec: gen.durationSec, coverUrl: gen.coverUrl ?? undefined },
      ...(bonusBuffer
        ? [{ audioUrl: gen.bonusAudioUrl!, durationSec: gen.durationSec, coverUrl: gen.coverUrl ?? undefined }]
        : []),
    ];
    gen.status = 'succeeded';
    gen.error = null;
    gen.completedAt = new Date();
    // Oprim auto-retry-ul — admin a livrat manual. Job-urile delayed deja
    // existente în BullMQ se vor activa eventual, dar processor-ul va vedea
    // providerJobId='manual' + status='succeeded' și va da skip.
    gen.nextRetryAt = null;
    const saved = await this.repo.save(gen);

    this.logger.warn(`[admin-manual-upload] generation=${saved.id} bonus=${!!bonusBuffer}`);

    // 4. Notify owner (email + chat) — lazy load processor pentru a refolosi
    //    aceeași logică ca pipeline-ul automat (template, branding, locale).
    try {
      const proc = this.moduleRef.get(GenerationsProcessor, { strict: false });
      await proc.notifyOwner(saved);
      void proc.notifyChat(saved.id, 'succeeded');
    } catch (err) {
      this.logger.error(`notify after manual upload failed: ${(err as Error).message}`);
    }

    return saved;
  }

  /**
   * Upload manual al unui MP3 ca VARIAȚIE nouă (rând-copil) — NU atinge piesa
   * live a clientului. Admin încarcă oricâte variante vrea (din Studio), le
   * ascultă și o promovează pe cea bună ca principală/bonus. providerJobId='manual'.
   * Nu trimite email — livrarea se face la promovare sau prin „Retrimite mailul".
   */
  async adminManualUploadVariation(
    generationId: string,
    buffer: Buffer,
    label?: string,
  ): Promise<Generation> {
    const src = await this.repo.findOne({ where: { id: generationId } });
    if (!src) throw new NotFoundException('Generation not found');
    if (!buffer || buffer.length === 0) throw new ConflictException('file_required');

    // Rând-copil pe baza comenzii-sursă (populează toate câmpurile NOT NULL).
    const payload = this.buildRegenPayload(src, undefined, src.lyrics ?? src.customLyrics ?? null);
    payload.parentGenerationId = this.rootGenerationId(src);
    payload.variationLabel = (label ?? '').trim() || 'Upload manual';
    payload.status = 'succeeded';
    payload.providerJobId = 'manual';
    payload.completedAt = new Date();
    const child = await this.repo.save(this.repo.create(payload));

    // Salvează audio + demo (ffmpeg re-encode 128k), atașează URL-urile.
    const main = await this.audio.saveAndMakeDemo(child.id, buffer, 'full');
    child.audioUrl = main.fullUrl;
    child.demoAudioUrl = main.demoUrl;
    child.tracks = [{ audioUrl: main.fullUrl, durationSec: child.durationSec }];
    const saved = await this.repo.save(child);
    this.logger.warn(`[admin-upload-variation] parent=${payload.parentGenerationId} → ${saved.id}`);
    return saved;
  }

  /**
   * Re-trimite emailul de livrare („melodia ta e gata") + chat notify pentru o
   * comandă, fără a schimba audio. Folosit din Studio după livrarea/modificarea
   * manuală (upload variante → promovare → „Retrimite mailul" dintr-un buton).
   */
  async adminResendDeliveryEmail(generationId: string): Promise<{ ok: boolean }> {
    const gen = await this.repo.findOne({ where: { id: generationId } });
    if (!gen) throw new NotFoundException('Generation not found');
    try {
      const proc = this.moduleRef.get(GenerationsProcessor, { strict: false });
      await proc.notifyOwner(gen);
      void proc.notifyChat(gen.id, 'succeeded');
    } catch (err) {
      this.logger.error(`resend delivery email failed: ${(err as Error).message}`);
      throw err;
    }
    this.logger.warn(`[admin-resend-email] generation=${gen.id}`);
    return { ok: true };
  }

  /**
   * Admin force-retry: bypassează owner check + retry limit. Folosit din admin
   * când Suno a căzut (status='failed') sau o generation a rămas blocată în
   * 'pending' / 'queued' (worker mort, lock pierdut etc.). Resetează același
   * set de câmpuri ca `retry()` și re-enqueueează job-ul.
   */
  async adminRetry(generationId: string): Promise<Generation> {
    const gen = await this.repo.findOne({ where: { id: generationId } });
    if (!gen) throw new NotFoundException('Generation not found');
    if (gen.status === 'succeeded') {
      throw new ConflictException('already_succeeded');
    }
    gen.status = 'queued';
    gen.error = null;
    gen.audioUrl = null;
    gen.bonusAudioUrl = null;
    gen.coverUrl = null;
    gen.tracks = [];
    gen.providerJobId = null;
    gen.completedAt = null;
    gen.retryCount = (gen.retryCount ?? 0) + 1;
    gen.autoRetryCount = 0;
    gen.nextRetryAt = null;
    gen.lastRetryAt = new Date();
    const saved = await this.repo.save(gen);

    await this.queue.add(
      'generate',
      { generationId: saved.id },
      { removeOnComplete: 100, removeOnFail: 100, attempts: 1 },
    );

    this.logger.warn(`[admin-retry] generation=${saved.id} retryCount=${saved.retryCount}`);
    return saved;
  }

  // ====================================================================
  //  ADMIN: regenerare, variații, swap, promovare + unelte Suno (media-op)
  // ====================================================================

  /** Id-ul comenzii „rădăcină" — pentru ca variațiile unei variații să rămână
   *  grupate sub comanda reală, nu sub un alt rând-variație. */
  private rootGenerationId(gen: Generation): string {
    return gen.parentGenerationId ?? gen.id;
  }

  /** Construiește payload-ul de creare pentru o variație/comandă nouă pornind de
   *  la o generare-sursă + editări + versuri. */
  private buildRegenPayload(
    src: Generation,
    edits: AdminRegenerateEdits | undefined,
    customLyrics: string | null,
  ): Partial<Generation> {
    const tier = normalizeTier(edits?.packageTier ?? src.packageTier);
    return {
      ownerUserId: src.ownerUserId,
      ownerGuestId: src.ownerGuestId,
      siteId: src.siteId,
      type: 'full',
      status: 'queued',
      durationSec: packageDef(tier).durationSec,
      style: edits?.style ?? src.style,
      occasion: edits?.occasion ?? src.occasion,
      recipientName: edits?.recipientName ?? src.recipientName,
      message: edits?.message ?? src.message,
      dedication: edits?.dedication !== undefined ? edits.dedication : src.dedication,
      voiceArtist: edits?.voiceArtist ?? src.voiceArtist,
      packageTier: tier,
      customLyrics,
      locale: src.locale,
      // Admin produce melodii cadou → deblocate complet, fără plată.
      paidUnlocked: true,
    };
  }

  /** Determină versurile (customLyrics) pe baza modului ales. */
  private resolveRegenLyrics(src: Generation, input: AdminRegenerateInput): string | null {
    const mode = input.lyricsMode ?? 'rewrite';
    if (mode === 'rewrite') return null; // pipeline-ul scrie versuri noi din câmpuri
    if (mode === 'custom') {
      const t = (input.customLyrics ?? '').trim();
      if (!t) throw new ConflictException('custom_lyrics_required');
      return t;
    }
    // keep — refolosim versurile existente literal (sunt „sacre" în lyrics pipeline)
    const existing = (src.lyrics ?? src.customLyrics ?? '').trim();
    if (!existing) throw new ConflictException('no_existing_lyrics_to_keep');
    return existing;
  }

  /**
   * Regenerare din admin cu 3 ținte:
   *  - `overwrite`  → re-rulează pe ACEEAȘI comandă (piesa veche dispare)
   *  - `new_track`  → creează o VARIAȚIE (rând-copil) sub comandă, fără a atinge live-ul
   *  - `new_order`  → creează o comandă nouă, independentă (melodie în plus)
   */
  async adminRegenerate(generationId: string, input: AdminRegenerateInput): Promise<Generation> {
    const src = await this.repo.findOne({ where: { id: generationId } });
    if (!src) throw new NotFoundException('Generation not found');

    const customLyrics = this.resolveRegenLyrics(src, input);
    const target = input.target;

    if (target === 'overwrite') {
      const tier = normalizeTier(input.edits?.packageTier ?? src.packageTier);
      src.style = input.edits?.style ?? src.style;
      src.occasion = input.edits?.occasion ?? src.occasion;
      src.recipientName = input.edits?.recipientName ?? src.recipientName;
      src.message = input.edits?.message ?? src.message;
      if (input.edits?.dedication !== undefined) src.dedication = input.edits.dedication;
      src.voiceArtist = input.edits?.voiceArtist ?? src.voiceArtist;
      src.packageTier = tier;
      if (src.type === 'full') src.durationSec = packageDef(tier).durationSec;
      src.customLyrics = customLyrics;
      // Reset audio + status pentru re-rulare.
      src.status = 'queued';
      src.error = null;
      src.audioUrl = null;
      src.bonusAudioUrl = null;
      src.demoAudioUrl = null;
      src.demoBonusAudioUrl = null;
      src.coverUrl = null;
      src.tracks = [];
      src.providerJobId = null;
      src.completedAt = null;
      src.retryCount = (src.retryCount ?? 0) + 1;
      src.nextRetryAt = null;
      src.lastRetryAt = new Date();
      const saved = await this.repo.save(src);
      await this.enqueueGenerate(saved.id);
      this.logger.warn(`[admin-regenerate] overwrite generation=${saved.id}`);
      return saved;
    }

    const payload = this.buildRegenPayload(src, input.edits, customLyrics);
    if (target === 'new_track') {
      payload.parentGenerationId = this.rootGenerationId(src);
      payload.variationLabel = input.label ?? 'Regenerare';
    } else {
      // new_order — comandă independentă
      payload.parentGenerationId = null;
      payload.paymentId = null;
    }
    const child = await this.repo.save(this.repo.create(payload));
    await this.enqueueGenerate(child.id);
    this.logger.warn(`[admin-regenerate] ${target} src=${src.id} → ${child.id}`);
    return child;
  }

  /** Re-roll: variație nouă cu ACELEAȘI versuri (doar audio re-generat). */
  async adminReroll(generationId: string): Promise<Generation> {
    return this.adminRegenerate(generationId, {
      target: 'new_track',
      lyricsMode: 'keep',
      label: 'Re-roll',
    });
  }

  /**
   * Setează DIRECT tipul (demo|full) și/sau pachetul (basic|plus|premium) al
   * unei comenzi din admin, FĂRĂ regenerarea melodiei. Spre deosebire de vechiul
   * „upgrade" (doar în sus, doar full), permite orice direcție (up/down) și
   * conversia demo↔full.
   *
   * Efecte:
   *  - type='full' → pagina publică servește maneaua COMPLETĂ (isPaid), nu demo-ul;
   *  - type='demo' → revine la demo-ul de 30s (maneaua completă se re-blochează);
   *  - durationSec se recalculează DOAR cât timp piesa nu e generată (queued/
   *    running/failed) — pentru o piesă `succeeded` audio-ul e deja fix;
   *  - dacă rezultă un pachet full căruia îi lipsesc livrabile (imagini social /
   *    videoclip) și piesa e `succeeded`, se generează în fundal doar ce lipsește.
   *  Plata existentă NU e atinsă — încasarea diferenței se face separat
   *  (payment link din chat sau curtoazie).
   */
  async adminSetPackaging(
    generationId: string,
    input: { type?: string; tier?: string },
  ): Promise<{ generation: Generation; deliverablesQueued: boolean }> {
    const gen = await this.repo.findOne({ where: { id: generationId } });
    if (!gen) throw new NotFoundException('Generation not found');
    if (input.type != null && input.type !== 'demo' && input.type !== 'full') {
      throw new ConflictException('invalid_type');
    }
    if (input.tier != null && !isPackageTier(input.tier)) {
      throw new ConflictException('invalid_tier');
    }

    const newType = (input.type ?? gen.type) as 'demo' | 'full';
    const newTier = normalizeTier(input.tier ?? gen.packageTier);
    const prev = `${gen.type}/${normalizeTier(gen.packageTier)}`;

    gen.type = newType;
    gen.packageTier = newTier;

    // Durata țintă se recalculează doar cât timp piesa NU e generată — altfel
    // audio-ul e deja fixat și n-are sens s-o schimbăm retroactiv.
    if (gen.status !== 'succeeded') {
      gen.durationSec = newType === 'demo' ? 30 : packageDef(newTier).durationSec;
    }

    // Livrabile: doar pentru o piesă full `succeeded` căreia îi lipsesc extras-urile
    // noului tier. Generăm în fundal DOAR ce lipsește, fără să atingem audio-ul.
    const def = packageDef(newTier);
    const needsExtras =
      newType === 'full' &&
      gen.status === 'succeeded' &&
      ((def.socialImage && (gen.socialImages?.length ?? 0) === 0) ||
        (def.video && !gen.videoUrl));
    if (needsExtras) gen.deliverablesReady = false;

    const saved = await this.repo.save(gen);
    if (needsExtras) {
      await this.queue.add(
        'upgrade-deliverables',
        { generationId: saved.id },
        { removeOnComplete: 100, removeOnFail: 100, attempts: 1 },
      );
    }
    this.logger.warn(
      `[admin-set-packaging] generation=${saved.id} ${prev} → ${newType}/${newTier}${needsExtras ? ' (extras queued)' : ''}`,
    );
    return { generation: saved, deliverablesQueued: needsExtras };
  }

  /** Interschimbă piesa principală ↔ bonus (audio + demo + video + wav). */
  async adminSwapTracks(generationId: string): Promise<Generation> {
    const gen = await this.repo.findOne({ where: { id: generationId } });
    if (!gen) throw new NotFoundException('Generation not found');
    if (!gen.bonusAudioUrl) throw new ConflictException('no_bonus_to_swap');
    const v = Date.now();
    const bust = (u: string | null): string | null => (u ? `${stripCacheBust(u)}?v=${v}` : null);
    [gen.audioUrl, gen.bonusAudioUrl] = [bust(gen.bonusAudioUrl), bust(gen.audioUrl)];
    [gen.demoAudioUrl, gen.demoBonusAudioUrl] = [bust(gen.demoBonusAudioUrl), bust(gen.demoAudioUrl)];
    [gen.videoUrl, gen.videoUrlBonus] = [gen.videoUrlBonus, gen.videoUrl];
    if (Array.isArray(gen.tracks) && gen.tracks.length >= 2) {
      [gen.tracks[0], gen.tracks[1]] = [gen.tracks[1], gen.tracks[0]];
    }
    if (gen.mediaExtras) {
      const m = gen.mediaExtras;
      [m.wavUrl, m.wavBonusUrl] = [m.wavBonusUrl, m.wavUrl];
      [m.musicVideoUrl, m.musicVideoBonusUrl] = [m.musicVideoBonusUrl, m.musicVideoUrl];
    }
    const saved = await this.repo.save(gen);
    this.logger.warn(`[admin-swap] generation=${saved.id}`);
    return saved;
  }

  /** Promovează o variație (rând-copil) în slot-ul principal/bonus al comenzii. */
  async adminPromoteVariation(
    variationId: string,
    slot: 'main' | 'bonus',
    opts: { notify?: boolean } = {},
  ): Promise<Generation> {
    const variation = await this.repo.findOne({ where: { id: variationId } });
    if (!variation) throw new NotFoundException('Variation not found');
    if (!variation.parentGenerationId) throw new ConflictException('not_a_variation');
    if (variation.status !== 'succeeded' || !variation.audioUrl) {
      throw new ConflictException('variation_not_ready');
    }
    const parent = await this.repo.findOne({ where: { id: variation.parentGenerationId } });
    if (!parent) throw new NotFoundException('Parent generation not found');

    const v = Date.now();
    const full = `${stripCacheBust(variation.audioUrl)}?v=${v}`;
    const demo = variation.demoAudioUrl ? `${stripCacheBust(variation.demoAudioUrl)}?v=${v}` : null;
    if (slot === 'main') {
      parent.audioUrl = full;
      parent.demoAudioUrl = demo;
      parent.coverUrl = variation.coverUrl ?? parent.coverUrl;
      parent.providerJobId = variation.providerJobId;
      if (Array.isArray(parent.tracks) && variation.tracks?.[0]) {
        parent.tracks[0] = variation.tracks[0];
      }
    } else {
      parent.bonusAudioUrl = full;
      parent.demoBonusAudioUrl = demo;
      if (variation.tracks?.[0]) {
        parent.tracks = [...(parent.tracks ?? []), variation.tracks[0]].slice(0, 2);
      }
    }
    parent.status = 'succeeded';
    parent.error = null;
    const saved = await this.repo.save(parent);
    this.logger.warn(`[admin-promote] variation=${variationId} → ${slot} of ${parent.id}`);

    if (opts.notify) {
      try {
        const proc = this.moduleRef.get(GenerationsProcessor, { strict: false });
        await proc.notifyOwner(saved);
        void proc.notifyChat(saved.id, 'succeeded');
      } catch (err) {
        this.logger.error(`notify after promote failed: ${(err as Error).message}`);
      }
    }
    return saved;
  }

  /** Lista variațiilor (rânduri-copil) ale unei comenzi. Ordonate manual
   *  (sortOrder) dacă au fost rearanjate, altfel cele mai noi primele. */
  async adminListVariations(parentId: string): Promise<Generation[]> {
    return this.repo.find({
      where: { parentGenerationId: parentId },
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
      take: 50,
    });
  }

  /** Rearanjează variațiile unei comenzi în ordinea dată (sortOrder = 1..N). */
  async adminReorderVariations(parentId: string, orderedIds: string[]): Promise<void> {
    const variations = await this.repo.find({
      where: { parentGenerationId: parentId },
      select: ['id'],
    });
    const valid = new Set(variations.map((v) => v.id));
    let pos = 1;
    for (const id of orderedIds) {
      if (!valid.has(id)) continue;
      await this.repo.update({ id, parentGenerationId: parentId }, { sortOrder: pos++ });
    }
  }

  /** Șterge o variație (doar rânduri-copil, niciodată o comandă reală). */
  async adminDeleteVariation(variationId: string): Promise<void> {
    const v = await this.repo.findOne({ where: { id: variationId } });
    if (!v) throw new NotFoundException('Variation not found');
    if (!v.parentGenerationId) throw new ConflictException('not_a_variation');
    await this.repo.delete({ id: variationId });
  }

  /** Prelungește o piesă → creează o VARIAȚIE care va conține audio-ul mai lung. */
  async adminExtend(
    generationId: string,
    opts: { slot?: 'main' | 'bonus'; continueAt?: number; style?: string } = {},
  ): Promise<Generation> {
    const src = await this.requireSunoTrack(generationId, opts.slot ?? 'main');
    const child = await this.repo.save(
      this.repo.create({
        ...this.buildRegenPayload(src.gen, undefined, src.gen.lyrics ?? null),
        parentGenerationId: this.rootGenerationId(src.gen),
        variationLabel:
          opts.continueAt != null ? `Extend de la ${Math.round(opts.continueAt)}s` : 'Extend',
        status: 'generating_audio',
      }),
    );
    await this.queue.add(
      'media-op',
      {
        op: 'extend',
        generationId: src.gen.id,
        childId: child.id,
        slot: opts.slot ?? 'main',
        params: { continueAt: opts.continueAt, style: opts.style },
      } satisfies MediaOpJob,
      { removeOnComplete: 100, removeOnFail: 100, attempts: 1 },
    );
    return child;
  }

  /** Cover/restyle al piesei → variație nouă cu alt stil. */
  async adminCover(
    generationId: string,
    opts: { slot?: 'main' | 'bonus'; style?: string; instrumental?: boolean; label?: string } = {},
  ): Promise<Generation> {
    const src = await this.requireSunoTrack(generationId, opts.slot ?? 'main', { allowManual: true });
    const child = await this.repo.save(
      this.repo.create({
        ...this.buildRegenPayload(
          src.gen,
          opts.style ? { style: opts.style } : undefined,
          src.gen.lyrics ?? null,
        ),
        parentGenerationId: this.rootGenerationId(src.gen),
        variationLabel: opts.label ?? (opts.style ? `Cover ${opts.style}` : 'Cover'),
        status: 'generating_audio',
      }),
    );
    await this.queue.add(
      'media-op',
      {
        op: 'cover',
        generationId: src.gen.id,
        childId: child.id,
        slot: opts.slot ?? 'main',
        params: { style: opts.style, instrumental: !!opts.instrumental },
      } satisfies MediaOpJob,
      { removeOnComplete: 100, removeOnFail: 100, attempts: 1 },
    );
    return child;
  }

  /**
   * Înlocuiește o secțiune (ex. refrenul) cu alt stil → variație nouă.
   * Dacă `autoChorus` (sau lipsesc start/end), procesorul detectează refrenul
   * din versurile aliniate temporal Suno.
   */
  async adminReplaceSection(
    generationId: string,
    opts: {
      slot?: 'main' | 'bonus';
      infillStartS?: number;
      infillEndS?: number;
      autoChorus?: boolean;
      style?: string;
      prompt?: string;
    },
  ): Promise<Generation> {
    const src = await this.requireSunoTrack(generationId, opts.slot ?? 'main');
    const auto = !!opts.autoChorus || opts.infillStartS == null || opts.infillEndS == null;
    const label = auto
      ? 'Refren schimbat'
      : `Secțiune ${Math.round(opts.infillStartS!)}-${Math.round(opts.infillEndS!)}s`;
    const child = await this.repo.save(
      this.repo.create({
        ...this.buildRegenPayload(src.gen, undefined, src.gen.lyrics ?? null),
        parentGenerationId: this.rootGenerationId(src.gen),
        variationLabel: label,
        status: 'generating_audio',
      }),
    );
    await this.queue.add(
      'media-op',
      {
        op: 'replace',
        generationId: src.gen.id,
        childId: child.id,
        slot: opts.slot ?? 'main',
        params: {
          autoChorus: auto,
          infillStartS: opts.infillStartS,
          infillEndS: opts.infillEndS,
          style: opts.style,
          prompt: opts.prompt,
        },
      } satisfies MediaOpJob,
      { removeOnComplete: 100, removeOnFail: 100, attempts: 1 },
    );
    return child;
  }

  /** WAV studio pentru un slot → atașat în mediaExtras. */
  async adminConvertWav(generationId: string, slot: 'main' | 'bonus' = 'main'): Promise<{ ok: true }> {
    await this.requireSunoTrack(generationId, slot);
    await this.queue.add(
      'media-op',
      { op: 'wav', generationId, slot } satisfies MediaOpJob,
      { removeOnComplete: 100, removeOnFail: 100, attempts: 1 },
    );
    return { ok: true };
  }

  /** Separare voce/instrumental (karaoke) sau stem-uri → mediaExtras. */
  async adminSeparateVocals(
    generationId: string,
    slot: 'main' | 'bonus' = 'main',
    type: 'separate_vocal' | 'split_stem' = 'separate_vocal',
  ): Promise<{ ok: true }> {
    await this.requireSunoTrack(generationId, slot);
    await this.queue.add(
      'media-op',
      { op: 'separate', generationId, slot, params: { type } } satisfies MediaOpJob,
      { removeOnComplete: 100, removeOnFail: 100, attempts: 1 },
    );
    return { ok: true };
  }

  /** Videoclip MP4 oficial Suno pentru un slot → mediaExtras. */
  async adminMusicVideo(generationId: string, slot: 'main' | 'bonus' = 'main'): Promise<{ ok: true }> {
    await this.requireSunoTrack(generationId, slot);
    await this.queue.add(
      'media-op',
      { op: 'video', generationId, slot } satisfies MediaOpJob,
      { removeOnComplete: 100, removeOnFail: 100, attempts: 1 },
    );
    return { ok: true };
  }

  /** Validează că generarea are un track Suno cu audioId (necesar pentru uneltele
   *  care lucrează pe Suno-side). `allowManual` permite operațiile pe upload-uri
   *  manuale (cover folosește URL-ul nostru public, nu audioId-ul Suno). */
  private async requireSunoTrack(
    generationId: string,
    slot: 'main' | 'bonus',
    opts: { allowManual?: boolean } = {},
  ): Promise<{ gen: Generation; idx: number; audioId?: string }> {
    const gen = await this.repo.findOne({ where: { id: generationId } });
    if (!gen) throw new NotFoundException('Generation not found');
    if (gen.status !== 'succeeded') throw new ConflictException('generation_not_succeeded');
    const idx = slot === 'bonus' ? 1 : 0;
    const audioId = gen.tracks?.[idx]?.audioId;
    if (!opts.allowManual && (!gen.providerJobId || gen.providerJobId === 'manual' || !audioId)) {
      throw new ConflictException('no_suno_track');
    }
    return { gen, idx, audioId };
  }

  private async enqueueGenerate(generationId: string): Promise<void> {
    await this.queue.add(
      'generate',
      { generationId },
      { removeOnComplete: 100, removeOnFail: 100, attempts: 1 },
    );
  }

  async unlockWithGift(
    generationId: string,
    consumeFn: () => Promise<{ ok: boolean; reason?: string }>,
    ctx: { userId: string | null; guestId: string | null },
  ): Promise<Generation> {
    return this.dataSource.transaction(async (mgr) => {
      const gen = await mgr.getRepository(Generation).findOne({ where: { id: generationId } });
      if (!gen) throw new NotFoundException('Generation not found');
      const ownerOk =
        (gen.ownerUserId && gen.ownerUserId === ctx.userId) ||
        (gen.ownerGuestId && gen.ownerGuestId === ctx.guestId);
      if (!ownerOk) throw new ForbiddenException('Not your generation');
      if (gen.paidUnlocked) return gen;

      const consume = await consumeFn();
      if (!consume.ok) {
        throw new ForbiddenException(consume.reason ?? 'gift_invalid');
      }
      gen.paidUnlocked = true;
      return mgr.getRepository(Generation).save(gen);
    });
  }

  /**
   * Creează o generation type='full' în starea „pending payment" — fără să o
   * pună la coadă. Folosit de flow-ul „pay-first" (site.demoEnabled=false):
   * userul completează formularul, vede prețul, plătește, ABIA APOI se
   * generează maneaua. Diferența față de create(type='full'):
   *   - Nu necesită paymentId în input (paymentul se creează după).
   *   - Nu se enqueueează (status rămâne 'pending').
   *   - paidUnlocked=false (devine true după webhook).
   */
  async createPendingForPayment(
    dto: Omit<CreateGenerationDto, 'type' | 'paymentId'>,
    ctx: { userId: string | null; guestId: string | null; siteId?: string | null; experienceSlug?: string | null },
  ): Promise<Generation> {
    if (!ctx.userId && !ctx.guestId) {
      throw new ForbiddenException('Missing guest session');
    }
    let personId: string | null = null;
    if (!ctx.userId && ctx.guestId) {
      const guest = await this.dataSource
        .getRepository(GuestSession)
        .findOne({ where: { id: ctx.guestId } });
      if (!guest) throw new NotFoundException('Guest session not found');
      if (!guest.email) throw new ForbiddenException('email_required');
      personId = guest.personId ?? null;
    }
    const tier = normalizeTier(dto.packageTier);
    const site = ctx.siteId ? await this.sites.findById(ctx.siteId) : null;
    const expSlug = ctx.experienceSlug || DEFAULT_EXPERIENCE_SLUG;
    const adminPkg = site?.experienceConfig?.items?.[expSlug]?.packages?.[tier] ?? null;
    const snap = snapshotFromDef(resolvePackageDef(tier, expSlug, adminPkg));
    const gen = this.repo.create({
      ownerUserId: ctx.userId,
      ownerGuestId: ctx.userId ? null : ctx.guestId,
      type: 'full',
      status: 'pending',
      durationSec: snap.durationSec,
      experienceSlug: expSlug,
      packageSnapshot: snap,
      personId,
      style: dto.style,
      occasion: dto.occasion,
      recipientName: dto.recipientName,
      message: dto.message,
      dedication: dto.dedication ?? null,
      voiceArtist: dto.voiceArtist,
      customLyrics: dto.customLyrics ?? null,
      tipAmount: dto.tipAmount ?? 0,
      premium: dto.premium ?? false,
      packageTier: tier,
      paymentId: null,
      paidUnlocked: false,
      locale: dto.locale ?? 'ro',
      siteId: ctx.siteId ?? null,
    });
    return this.repo.save(gen);
  }

  async applyPaidUpgrade(
    generationId: string,
    targetTierRaw: string,
    experienceSlug?: string | null,
  ): Promise<Generation | null> {
    const gen = await this.repo.findOne({ where: { id: generationId } });
    if (!gen) return null;
    const target = normalizeTier(targetTierRaw);
    const slug = experienceSlug || gen.experienceSlug || DEFAULT_EXPERIENCE_SLUG;
    const site = gen.siteId ? await this.sites.findById(gen.siteId) : null;
    const adminPkg = site?.experienceConfig?.items?.[slug]?.packages?.[target] ?? null;
    const resolved = resolvePackageDef(target, slug, adminPkg);
    gen.packageTier = target;
    gen.experienceSlug = slug;
    gen.packageSnapshot = snapshotFromDef(resolved);
    const needsExtras =
      gen.type === 'full' &&
      gen.status === 'succeeded' &&
      ((resolved.socialImage && (gen.socialImages?.length ?? 0) === 0) ||
        (resolved.video && !gen.videoUrl));
    if (needsExtras) gen.deliverablesReady = false;
    const saved = await this.repo.save(gen);
    if (needsExtras) {
      await this.queue.add(
        'upgrade-deliverables',
        { generationId: saved.id },
        { removeOnComplete: 100, removeOnFail: 100, attempts: 1 },
      );
    }
    return saved;
  }

  /**
   * Marchează o generation ca plătită. Apelat din webhook-ul Stripe după ce
   * un payment a fost confirmat. Idempotent:
   *   - paidUnlocked devine true (acoperă atât flow-ul pay-first cât și
   *     demo-first — în demo-first, generation era deja 'succeeded' dar
   *     paidUnlocked=false; webhook-ul e singura sursă de adevăr).
   *   - dacă status='pending' (flow pay-first), o pune la coadă.
   *   - trimite emailul de confirmare a plății (cu link spre /m/<id>).
   */
  async markPaidAndQueue(generationId: string, paymentId: string): Promise<Generation | null> {
    const gen = await this.repo.findOne({ where: { id: generationId } });
    if (!gen) return null;

    // ============== Plasă anti dublă-plată ==============
    // O a doua plată care aterizează pe o generare DEJA plătită de ALTĂ plată =
    // client taxat de două ori pentru aceeași melodie (a re-inițiat checkout-ul pe
    // același generationId — vezi cazul baderalmohamed03, 10 iul 2026: 49.99 + 24.99
    // pe aceeași piesă). NU rescriem atribuirea (altfel prima plată — cea care a
    // produs efectiv melodia — apare orfană în DB), NU regenerăm, NU retrimitem
    // email de confirmare. Doar alertăm adminii ca să decidă (refund manual etc.).
    if (gen.paidUnlocked && gen.paymentId && gen.paymentId !== paymentId) {
      this.logger.error(
        `DUBLĂ PLATĂ: plata ${paymentId} a aterizat pe generarea ${gen.id} deja plătită de ${gen.paymentId}. ` +
          `NU suprascriu atribuirea, NU regenerez. Alertez adminii.`,
      );
      await this.alertDuplicatePayment(gen, paymentId).catch((e) =>
        this.logger.warn(`alertDuplicatePayment failed: ${(e as Error).message}`),
      );
      return gen;
    }

    const wasPending = gen.status === 'pending';
    const wasAlreadyUnlocked = gen.paidUnlocked;

    gen.paidUnlocked = true;
    gen.paymentId = paymentId;
    if (wasPending) gen.status = 'queued';
    const saved = await this.repo.save(gen);

    if (wasPending) {
      await this.queue.add(
        'generate',
        { generationId: saved.id },
        { removeOnComplete: 100, removeOnFail: 100, attempts: 1 },
      );
    }

    if (!wasAlreadyUnlocked) {
      await this.sendPaymentConfirmationEmail(saved, paymentId);
    }

    return saved;
  }

  /**
   * Alertă email către admini când o a doua plată aterizează pe o generare deja
   * plătită (dublă-plată pe aceeași melodie). Adminii decid dacă e nevoie de
   * refund manual. Best-effort — nu blochează webhook-ul dacă mail-ul eșuează.
   */
  private async alertDuplicatePayment(
    gen: Generation,
    duplicatePaymentId: string,
  ): Promise<void> {
    // Destinatari: AI_ALERT_EMAILS (setare) → fallback ADMIN_EMAILS (env).
    let recipients: string[] = [];
    try {
      const settingsMod = await import('../settings/settings.service');
      const settings = this.moduleRef.get(settingsMod.SettingsService, { strict: false });
      const raw = (await settings.get('AI_ALERT_EMAILS')) ?? '';
      recipients = raw.split(',').map((e) => e.trim()).filter(Boolean);
    } catch {
      /* fallback mai jos */
    }
    if (recipients.length === 0) {
      const fallback = this.config.get<string>('ADMIN_EMAILS') ?? '';
      recipients = fallback.split(',').map((e) => e.trim()).filter(Boolean);
    }
    if (recipients.length === 0) return;

    const site = gen.siteId ? await this.sites.findById(gen.siteId).catch(() => null) : null;
    const dupPayment = await this.dataSource
      .getRepository(Payment)
      .findOne({ where: { id: duplicatePaymentId } });
    const amount = dupPayment ? (dupPayment.amount / 100).toFixed(2) : '?';
    const currency = dupPayment?.currency ?? '';

    const subject = `⚠️ Dublă plată — ${amount} ${currency} pe melodie deja plătită (${site?.domain ?? 'site'})`;
    const lines = [
      `O a doua plată a aterizat pe o melodie DEJA plătită și livrată.`,
      ``,
      `Generare:  ${gen.id} (destinatar: ${gen.recipientName ?? '-'})`,
      `Site:      ${site?.domain ?? gen.siteId ?? '-'}`,
      `Plata originală (a produs melodia):  ${gen.paymentId}`,
      `Plata duplicat (FĂRĂ contravaloare): ${duplicatePaymentId} — ${amount} ${currency}`,
      ``,
      `Atribuirea NU a fost suprascrisă, melodia NU a fost regenerată.`,
      `Verifică în Stripe și decide dacă acorzi refund pentru plata duplicat.`,
    ];
    const body = lines.join('\n');

    await this.mailer.send(
      { to: recipients.join(','), subject, text: body, html: `<pre>${body}</pre>` },
      { site, kind: 'duplicate_payment_alert', relatedId: duplicatePaymentId },
    );
  }

  private async sendPaymentConfirmationEmail(gen: Generation, paymentId: string): Promise<void> {
    try {
      const payment = await this.dataSource
        .getRepository(Payment)
        .findOne({ where: { id: paymentId } });
      if (!payment) return;

      let email: string | null = null;
      if (gen.ownerUserId) {
        const u = await this.users.findOne({ where: { id: gen.ownerUserId } });
        email = u?.email ?? null;
      } else if (gen.ownerGuestId) {
        const g = await this.guests.findOne({ where: { id: gen.ownerGuestId } });
        email = g?.email ?? null;
      }
      if (!email) return;

      const site = gen.siteId ? await this.sites.findById(gen.siteId) : null;
      const siteUrl = site
        ? site.domain.startsWith('localhost') || site.domain.startsWith('127.')
          ? this.config.get<string>('APP_URL') ?? `http://${site.domain}`
          : `https://${site.domain}`
        : this.config.get<string>('APP_URL') ?? 'http://localhost:1500';
      const link = `${siteUrl}/m/${gen.id}`;

      const tpl = paymentSuccessTemplate({
        amountRON: payment.amount / 100,
        currency: payment.currency,
        generationLink: link,
        recipientName: gen.recipientName,
        locale: site?.locale ?? gen.locale ?? 'ro',
        branding: brandingFromSite(site),
      });
      await this.mailer.send(
        {
          to: email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          from: site?.fromEmail ?? undefined,
        },
        { site, kind: 'payment_success', userId: gen.ownerUserId ?? null, relatedId: payment.id },
      );
    } catch (err) {
      this.logger.warn(
        `payment confirmation email failed for gen ${gen.id}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Setează imaginea socială curentă (aleasă din variantele generate sau
   * upload-ul propriu). Owner-only. Validează că URL-ul aparține generation-ului
   * (e în socialImages SAU == socialImageUploaded).
   */
  async selectSocialImage(
    generationId: string,
    url: string,
    ctx: { userId: string | null; guestId: string | null },
  ): Promise<Generation> {
    const gen = await this.repo.findOne({ where: { id: generationId } });
    if (!gen) throw new NotFoundException('Generation not found');
    const ownerOk =
      (gen.ownerUserId && gen.ownerUserId === ctx.userId) ||
      (gen.ownerGuestId && gen.ownerGuestId === ctx.guestId);
    if (!ownerOk) throw new ForbiddenException('Not your generation');

    const allowed = [...(gen.socialImages ?? []), gen.socialImageUploaded].filter(
      (u): u is string => !!u,
    );
    if (!allowed.includes(url)) {
      throw new ForbiddenException('invalid_social_image_url');
    }
    gen.socialImageSelected = url;
    return this.repo.save(gen);
  }

  /**
   * Persistă URL-ul unei imagini sociale încărcate de owner + o setează ca
   * selectată. Owner-only. Fișierul a fost deja salvat de
   * SocialImageUploadService.
   */
  async setUploadedSocialImage(
    generationId: string,
    url: string,
    ctx: { userId: string | null; guestId: string | null },
  ): Promise<Generation> {
    const gen = await this.repo.findOne({ where: { id: generationId } });
    if (!gen) throw new NotFoundException('Generation not found');
    const ownerOk =
      (gen.ownerUserId && gen.ownerUserId === ctx.userId) ||
      (gen.ownerGuestId && gen.ownerGuestId === ctx.guestId);
    if (!ownerOk) throw new ForbiddenException('Not your generation');

    gen.socialImageUploaded = url;
    gen.socialImageSelected = url;
    return this.repo.save(gen);
  }

  async unlockWithPayment(
    generationId: string,
    paymentId: string,
    ctx: { userId: string | null; guestId: string | null },
  ): Promise<Generation> {
    return this.dataSource.transaction(async (mgr) => {
      const gen = await mgr.getRepository(Generation).findOne({ where: { id: generationId } });
      if (!gen) throw new NotFoundException('Generation not found');
      const ownerOk =
        (gen.ownerUserId && gen.ownerUserId === ctx.userId) ||
        (gen.ownerGuestId && gen.ownerGuestId === ctx.guestId);
      if (!ownerOk) throw new ForbiddenException('Not your generation');

      const payment = await mgr.getRepository(Payment).findOne({ where: { id: paymentId } });
      if (!payment || payment.status !== 'paid') {
        throw new ForbiddenException('payment not confirmed');
      }

      gen.paidUnlocked = true;
      gen.paymentId = payment.id;
      return mgr.getRepository(Generation).save(gen);
    });
  }
}
