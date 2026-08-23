import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';

import { VideoCollage, CollageTrack } from './video-collage.entity';
import { CollageUploadService, UploadedImage } from './collage-upload.service';
import { COLLAGE_QUEUE, normalizeAspect, type CollageAspect } from './collage.constants';
import { Generation } from '../generations/generation.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { User } from '../users/user.entity';
import { PACKAGE_FEATURES, normalizeTier } from '../payments/packages';
import { verifyUnlock } from '../../common/unlock';

export interface OwnerCtx {
  userId: string | null;
  guestId: string | null;
  /** Parola de deblocare (pentru vizitatori non-owner cu link+parolă). */
  password?: string | null;
}

/** Ce colaj a fost VÂNDUT pe o comandă (colaj da/nu, câte poze, refren sau tot track-ul). */
export interface CollageEntitlement {
  collage: boolean;
  photoLimit: number;
  fullTrack: boolean;
}

@Injectable()
export class CollageService {
  private readonly logger = new Logger('CollageService');

  constructor(
    @InjectRepository(VideoCollage) private readonly repo: Repository<VideoCollage>,
    @InjectRepository(Generation) private readonly generations: Repository<Generation>,
    @InjectRepository(GuestSession) private readonly guests: Repository<GuestSession>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly upload: CollageUploadService,
    @InjectQueue(COLLAGE_QUEUE) private readonly queue: Queue,
  ) {}

  /** True dacă ctx e owner-ul generation-ului. */
  private isOwner(g: Generation, ctx: OwnerCtx): boolean {
    return !!(
      (g.ownerUserId && g.ownerUserId === ctx.userId) ||
      (g.ownerGuestId && g.ownerGuestId === ctx.guestId)
    );
  }

  /**
   * Verifică dreptul de SCRIERE (creare colaj/image-video): doar owner-ul.
   * Crearea de conținut nu se face niciodată cu parolă — doar owner-ul produce.
   */
  private async assertOwnedGeneration(
    generationId: string,
    ctx: OwnerCtx,
  ): Promise<Generation> {
    const g = await this.generations.findOne({ where: { id: generationId } });
    if (!g) throw new NotFoundException('Generation indisponibilă');
    if (!this.isOwner(g, ctx)) throw new ForbiddenException('Not your generation');
    return g;
  }

  /**
   * Verifică dreptul de CITIRE (vizionare colaj): owner SAU vizitator cu parola
   * corectă (dacă owner-ul a setat o parolă de deblocare pe manea).
   */
  private async assertCanView(
    generationId: string,
    ctx: OwnerCtx,
  ): Promise<Generation> {
    const g = await this.generations.findOne({ where: { id: generationId } });
    if (!g) throw new NotFoundException('Generation indisponibilă');
    if (this.isOwner(g, ctx)) return g;
    if (verifyUnlock(g.id, ctx.password ?? null, g.unlockPasswordHash)) return g;
    throw new ForbiddenException('Not your generation');
  }

  /** Emailul owner-ului (user sau guest) pentru notificarea finală. */
  private async ownerEmail(gen: Generation): Promise<string | null> {
    if (gen.ownerUserId) {
      const u = await this.users.findOne({ where: { id: gen.ownerUserId } });
      return u?.email ?? null;
    }
    if (gen.ownerGuestId) {
      const g = await this.guests.findOne({ where: { id: gen.ownerGuestId } });
      return g?.email ?? null;
    }
    return null;
  }

  /**
   * Track-urile pe care putem monta un clip: piesa principală, bonusul (dacă
   * există) și orice variație-copil succeeded. Ordinea e cea de pe pagina
   * publică. Adminul poate adăuga variații ulterior — apar automat aici.
   */
  async listAvailableTracks(
    gen: Generation,
  ): Promise<Array<{ track: CollageTrack; label: string }>> {
    const out: Array<{ track: CollageTrack; label: string }> = [];
    if (gen.audioUrl) {
      out.push({ track: 'main', label: gen.variationLabel ?? 'Varianta 1' });
    }
    if (gen.bonusAudioUrl) {
      out.push({ track: 'bonus', label: 'Varianta 2' });
    }
    const variations = await this.generations.find({
      where: { parentGenerationId: gen.id, status: 'succeeded' },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
      take: 50,
    });
    for (const v of variations) {
      if (!v.audioUrl) continue;
      out.push({ track: v.id, label: v.variationLabel ?? 'Variație' });
    }
    return out;
  }

  /**
   * Ce colaj i s-a vândut clientului: citim din `packageSnapshot` (înghețat la
   * crearea comenzii, deci reflectă oferta de ATUNCI), cu fallback pe featurile
   * pachetului curent — comenzile vechi n-au snapshot.
   */
  private collageEntitlement(gen: Generation): CollageEntitlement {
    const feat = PACKAGE_FEATURES[normalizeTier(gen.packageTier)];
    const snap = gen.packageSnapshot ?? null;
    const collage = typeof snap?.collage === 'boolean' ? snap.collage : feat.collage;
    const photoLimit =
      typeof snap?.collagePhotoLimit === 'number' ? snap.collagePhotoLimit : feat.collagePhotoLimit;
    const fullTrack =
      typeof snap?.collageFullTrack === 'boolean' ? snap.collageFullTrack : feat.collageFullTrack;
    return { collage, photoLimit, fullTrack };
  }

  /**
   * Poarta pachetului pentru clipurile create de CLIENT: colajul e inclus doar
   * în Plus și Premium, iar numărul de poze e plafonat de pachet (Plus 4 /
   * Premium 15). Operațiile de admin NU trec pe aici — adminul poate oricând.
   */
  private assertCollageAllowed(gen: Generation, photoCount: number): CollageEntitlement {
    const ent = this.collageEntitlement(gen);
    if (!ent.collage) {
      throw new ForbiddenException(
        'Colajul video e disponibil doar pentru pachetele Plus și Premium',
      );
    }
    const limit = Math.max(0, ent.photoLimit);
    if (limit > 0 && photoCount > limit) {
      throw new BadRequestException(
        `Pachetul tău permite maxim ${limit} ${limit === 1 ? 'poză' : 'poze'} în colaj`,
      );
    }
    // NOTĂ: `fullTrack=false` (Plus = doar refrenul) nu e încă respectat de
    // renderer — `CollageProcessor` montează mereu pe toată melodia. Clientul
    // primește mai mult decât i s-a vândut, nu mai puțin; limitarea la refren
    // cere o coloană nouă pe `video_collages` + suport în processor.
    return ent;
  }

  /** Melodia aleasă există (main / bonus / variație-copil). */
  private async assertTrackAvailable(gen: Generation, track: CollageTrack): Promise<void> {
    const tracks = await this.listAvailableTracks(gen);
    if (tracks.some((t) => t.track === track)) return;
    throw new NotFoundException(
      track === 'bonus' ? 'A doua melodie nu este disponibilă' : 'Melodia nu este disponibilă',
    );
  }

  /** Set-ul de imagini permise ca sursă pentru image_video (anti-abuz path). */
  private allowedImageUrls(gen: Generation): Set<string> {
    const set = new Set<string>();
    // variantele generate de noi
    for (let i = 1; i <= 4; i++) set.add(`/uploads/social/${gen.id}/v${i}.png`);
    for (const u of gen.socialImages ?? []) if (u) set.add(u);
    if (gen.socialImageSelected) set.add(gen.socialImageSelected);
    if (gen.socialImageUploaded) set.add(gen.socialImageUploaded);
    return set;
  }

  /**
   * Creează un colaj (slideshow): verifică ownership + pachetul, salvează
   * imaginile, persistă rândul (pending) și pune job pe coada `collage`.
   */
  async create(args: {
    generationId: string;
    track: CollageTrack;
    aspect?: string;
    files: UploadedImage[];
    ctx: OwnerCtx;
  }): Promise<{ collageId: string; status: string }> {
    const gen = await this.assertOwnedGeneration(args.generationId, args.ctx);
    this.assertCollageAllowed(gen, args.files?.length ?? 0);
    await this.assertTrackAvailable(gen, args.track);

    const aspect: CollageAspect = normalizeAspect(args.aspect);
    const email = await this.ownerEmail(gen);

    // Creăm întâi rândul ca să avem un id stabil pentru directorul de upload.
    const collage = await this.repo.save(
      this.repo.create({
        generationId: gen.id,
        track: args.track,
        kind: 'collage',
        aspect,
        status: 'pending',
        imageCount: args.files.length,
        email,
      }),
    );

    try {
      await this.upload.save(collage.id, args.files);
    } catch (err) {
      await this.repo.delete({ id: collage.id }).catch(() => {});
      throw err;
    }

    await this.enqueue(collage.id);
    this.logger.log(
      `collage ${collage.id.slice(0, 8)} queued gen=${gen.id.slice(0, 8)} track=${args.track} aspect=${aspect} imgs=${args.files.length}`,
    );
    return { collageId: collage.id, status: collage.status };
  }

  /**
   * Creează un image-video: o singură imagine (poza de share aleasă) statică pe
   * toată melodia. Fără upload — folosește o imagine deja existentă a manelei.
   */
  async createImageVideo(args: {
    generationId: string;
    track: CollageTrack;
    aspect?: string;
    imageUrl: string;
    ctx: OwnerCtx;
  }): Promise<{ collageId: string; status: string }> {
    const gen = await this.assertOwnedGeneration(args.generationId, args.ctx);
    // Aceeași poartă ca la colaj — e tot un clip video pe piesă, doar cu o poză.
    this.assertCollageAllowed(gen, 1);
    await this.assertTrackAvailable(gen, args.track);

    // Securitate: imaginea sursă trebuie să fie una dintre imaginile manelei.
    const url = (args.imageUrl ?? '').trim();
    if (!this.allowedImageUrls(gen).has(url)) {
      throw new BadRequestException('Imagine sursă invalidă');
    }

    const aspect: CollageAspect = normalizeAspect(args.aspect);
    const email = await this.ownerEmail(gen);

    const collage = await this.repo.save(
      this.repo.create({
        generationId: gen.id,
        track: args.track,
        kind: 'image_video',
        aspect,
        sourceImageUrl: url,
        status: 'pending',
        imageCount: 1,
        email,
      }),
    );

    await this.enqueue(collage.id);
    this.logger.log(
      `image_video ${collage.id.slice(0, 8)} queued gen=${gen.id.slice(0, 8)} track=${args.track} aspect=${aspect}`,
    );
    return { collageId: collage.id, status: collage.status };
  }

  /**
   * Un singur upload de poze → câte un colaj pe FIECARE variantă de melodie
   * (main + bonus + variații-copil). Imaginile se salvează o dată și se copiază.
   */
  async createBatch(args: {
    generationId: string;
    aspect?: string;
    files: UploadedImage[];
    ctx: OwnerCtx;
  }): Promise<{ collages: Array<{ collageId: string; status: string; track: string }> }> {
    const gen = await this.assertOwnedGeneration(args.generationId, args.ctx);
    if (!args.files?.length) {
      throw new BadRequestException('Lipsesc imaginile (field name: images)');
    }
    this.assertCollageAllowed(gen, args.files.length);
    const tracks = await this.listAvailableTracks(gen);
    if (tracks.length === 0) {
      throw new BadRequestException('Nu există nicio variantă de melodie pe care să montăm clipul');
    }

    const aspect: CollageAspect = normalizeAspect(args.aspect);
    const email = await this.ownerEmail(gen);
    const created: VideoCollage[] = [];
    let srcId: string | null = null;

    try {
      for (const t of tracks) {
        const collage = await this.repo.save(
          this.repo.create({
            generationId: gen.id,
            track: t.track,
            kind: 'collage',
            aspect,
            status: 'pending',
            imageCount: args.files.length,
            email,
          }),
        );
        created.push(collage);
        if (!srcId) {
          await this.upload.save(collage.id, args.files);
          srcId = collage.id;
        } else {
          const n = await this.upload.copyImages(srcId, collage.id);
          if (n === 0) throw new Error('copy images failed');
        }
      }
    } catch (err) {
      for (const c of created) {
        await this.repo.delete({ id: c.id }).catch(() => {});
      }
      throw err;
    }

    for (const c of created) await this.enqueue(c.id);
    this.logger.log(
      `collage-batch gen=${gen.id.slice(0, 8)} queued ${created.length} clips aspect=${aspect} imgs=${args.files.length}`,
    );
    return {
      collages: created.map((c) => ({ collageId: c.id, status: c.status, track: c.track })),
    };
  }

  private async enqueue(collageId: string): Promise<void> {
    await this.queue.add(
      'render',
      { collageId },
      { attempts: 1, removeOnComplete: true, removeOnFail: 100 },
    );
  }

  /** Toate colajele/image-videos ale unei manele (owner sau cine are parola). */
  async listForGeneration(generationId: string, ctx: OwnerCtx): Promise<VideoCollage[]> {
    await this.assertCanView(generationId, ctx);
    return this.repo.find({ where: { generationId }, order: { createdAt: 'DESC' } });
  }

  /** Ultimul colaj al unei generation (owner sau cine are parola). */
  async latestForGeneration(
    generationId: string,
    ctx: OwnerCtx,
  ): Promise<VideoCollage | null> {
    await this.assertCanView(generationId, ctx);
    return this.repo.findOne({
      where: { generationId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Un colaj anume (owner sau cine are parola). */
  async getForGeneration(
    generationId: string,
    collageId: string,
    ctx: OwnerCtx,
  ): Promise<VideoCollage> {
    await this.assertCanView(generationId, ctx);
    const c = await this.repo.findOne({ where: { id: collageId, generationId } });
    if (!c) throw new NotFoundException('Colaj indisponibil');
    return c;
  }

  // ─────────────────── ADMIN (cross-tenant, bypass ownership) ────────────────
  // Operațiile de mai jos NU verifică owner/parolă — sunt protejate de AdminGuard
  // la nivel de controller. Colajele create de admin au `email=null` (fără
  // notificare automată către client): adminul verifică rezultatul, apoi îl
  // trimite manual (ex. din chat).

  /** Generation-ul, fără verificare de owner (pentru operații admin). */
  private async adminRequireGeneration(generationId: string): Promise<Generation> {
    const g = await this.generations.findOne({ where: { id: generationId } });
    if (!g) throw new NotFoundException('Generation indisponibilă');
    return g;
  }

  /** Track-ul are audio pe disc (fără restricția premium — admin poate oricând). */
  private assertTrackAudio(gen: Generation, track: CollageTrack): void {
    const hasTrack = track === 'bonus' ? !!gen.bonusAudioUrl : !!gen.audioUrl;
    if (!hasTrack) {
      throw new NotFoundException(
        track === 'bonus' ? 'A doua melodie nu este disponibilă' : 'Melodia nu este disponibilă',
      );
    }
  }

  /** Admin: toate colajele unei generări + imaginile sursă de pe disc. */
  async adminListForGeneration(
    generationId: string,
  ): Promise<Array<VideoCollage & { images: string[] }>> {
    await this.adminRequireGeneration(generationId);
    const items = await this.repo.find({
      where: { generationId },
      order: { createdAt: 'DESC' },
    });
    const out: Array<VideoCollage & { images: string[] }> = [];
    for (const c of items) {
      const images = c.kind === 'collage' ? await this.upload.listImageUrls(c.id) : [];
      out.push({ ...c, images });
    }
    return out;
  }

  /** Admin: creează un colaj din imagini încărcate de admin (fără email automat). */
  async adminCreateUpload(args: {
    generationId: string;
    track: CollageTrack;
    aspect?: string;
    files: UploadedImage[];
  }): Promise<{ collageId: string; status: string }> {
    const gen = await this.adminRequireGeneration(args.generationId);
    this.assertTrackAudio(gen, args.track);
    const aspect: CollageAspect = normalizeAspect(args.aspect);
    const collage = await this.repo.save(
      this.repo.create({
        generationId: gen.id,
        track: args.track,
        kind: 'collage',
        aspect,
        status: 'pending',
        imageCount: args.files.length,
        email: null,
      }),
    );
    try {
      await this.upload.save(collage.id, args.files);
    } catch (err) {
      await this.repo.delete({ id: collage.id }).catch(() => {});
      throw err;
    }
    await this.enqueue(collage.id);
    this.logger.log(
      `[admin] collage ${collage.id.slice(0, 8)} queued gen=${gen.id.slice(0, 8)} imgs=${args.files.length}`,
    );
    return { collageId: collage.id, status: collage.status };
  }

  /**
   * Admin: regenerează un colaj existent cu ACELEAȘI poze (altă variantă, ordinea
   * se re-amestecă la render) sau reface un image_video. Creează un colaj NOU —
   * nu-l atinge pe cel vechi.
   */
  async adminRegenerate(
    sourceCollageId: string,
    opts: { track?: CollageTrack; aspect?: string } = {},
  ): Promise<{ collageId: string; status: string }> {
    const src = await this.repo.findOne({ where: { id: sourceCollageId } });
    if (!src) throw new NotFoundException('Colaj indisponibil');
    const gen = await this.adminRequireGeneration(src.generationId);
    const track: CollageTrack = opts.track ?? src.track;
    this.assertTrackAudio(gen, track);
    const aspect: CollageAspect = normalizeAspect(opts.aspect ?? src.aspect);

    if (src.kind === 'image_video') {
      const collage = await this.repo.save(
        this.repo.create({
          generationId: gen.id,
          track,
          kind: 'image_video',
          aspect,
          sourceImageUrl: src.sourceImageUrl,
          status: 'pending',
          imageCount: 1,
          email: null,
        }),
      );
      await this.enqueue(collage.id);
      return { collageId: collage.id, status: collage.status };
    }

    // kind = 'collage': colaj nou, copiem pozele sursă în noul director.
    const collage = await this.repo.save(
      this.repo.create({
        generationId: gen.id,
        track,
        kind: 'collage',
        aspect,
        status: 'pending',
        imageCount: src.imageCount,
        email: null,
      }),
    );
    const copied = await this.upload.copyImages(src.id, collage.id);
    if (copied === 0) {
      await this.repo.delete({ id: collage.id }).catch(() => {});
      throw new BadRequestException('Colajul sursă nu mai are imagini pe disc');
    }
    await this.repo.update({ id: collage.id }, { imageCount: copied });
    await this.enqueue(collage.id);
    this.logger.log(
      `[admin] regenerate collage ${collage.id.slice(0, 8)} from ${src.id.slice(0, 8)} imgs=${copied}`,
    );
    return { collageId: collage.id, status: collage.status };
  }
}
