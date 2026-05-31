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
import { verifyUnlock } from '../../common/unlock';

export interface OwnerCtx {
  userId: string | null;
  guestId: string | null;
  /** Parola de deblocare (pentru vizitatori non-owner cu link+parolă). */
  password?: string | null;
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

  /** Verifică tier premium + că melodia aleasă există pe disc. */
  private assertTrackAvailable(gen: Generation, track: CollageTrack): void {
    if (gen.packageTier !== 'premium') {
      throw new ForbiddenException('Disponibil doar pentru pachetul Premium');
    }
    const hasTrack = track === 'bonus' ? !!gen.bonusAudioUrl : !!gen.audioUrl;
    if (!hasTrack) {
      throw new NotFoundException(
        track === 'bonus' ? 'A doua melodie nu este disponibilă' : 'Melodia nu este disponibilă',
      );
    }
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
   * Creează un colaj (slideshow): verifică ownership + premium, salvează
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
    this.assertTrackAvailable(gen, args.track);

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
    this.assertTrackAvailable(gen, args.track);

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
}
