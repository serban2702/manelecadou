import {
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
import { COLLAGE_QUEUE } from './collage.constants';
import { Generation } from '../generations/generation.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { User } from '../users/user.entity';

export interface OwnerCtx {
  userId: string | null;
  guestId: string | null;
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

  /** Verifică ownership-ul generation-ului (aceeași logică ca GenerationsService). */
  private async assertOwnedGeneration(
    generationId: string,
    ctx: OwnerCtx,
  ): Promise<Generation> {
    const g = await this.generations.findOne({ where: { id: generationId } });
    if (!g) throw new NotFoundException('Generation indisponibilă');
    const ownerOk =
      (g.ownerUserId && g.ownerUserId === ctx.userId) ||
      (g.ownerGuestId && g.ownerGuestId === ctx.guestId);
    if (!ownerOk) throw new ForbiddenException('Not your generation');
    return g;
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
   * Creează un colaj: verifică ownership, salvează imaginile, persistă rândul
   * (status pending) și pune job pe coada `collage`.
   */
  async create(args: {
    generationId: string;
    track: CollageTrack;
    files: UploadedImage[];
    ctx: OwnerCtx;
  }): Promise<{ collageId: string; status: string }> {
    const gen = await this.assertOwnedGeneration(args.generationId, args.ctx);

    // Colajul video e exclusiv pachetului PREMIUM (cea mai scumpă manea).
    if (gen.packageTier !== 'premium') {
      throw new ForbiddenException('Colajul video e disponibil doar pentru pachetul Premium');
    }

    // Verificăm că melodia aleasă chiar există pe disc (audioUrl / bonusAudioUrl).
    const hasTrack =
      args.track === 'bonus' ? !!gen.bonusAudioUrl : !!gen.audioUrl;
    if (!hasTrack) {
      throw new NotFoundException(
        args.track === 'bonus'
          ? 'A doua melodie nu este disponibilă'
          : 'Melodia nu este disponibilă',
      );
    }

    const email = await this.ownerEmail(gen);

    // Creăm întâi rândul ca să avem un id stabil pentru directorul de upload.
    const collage = await this.repo.save(
      this.repo.create({
        generationId: gen.id,
        track: args.track,
        status: 'pending',
        imageCount: args.files.length,
        email,
      }),
    );

    try {
      await this.upload.save(collage.id, args.files);
    } catch (err) {
      // Curățăm rândul dacă upload-ul eșuează (validare etc.).
      await this.repo.delete({ id: collage.id }).catch(() => {});
      throw err;
    }

    await this.queue.add(
      'render',
      { collageId: collage.id },
      {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );

    this.logger.log(
      `collage ${collage.id.slice(0, 8)} queued gen=${gen.id.slice(0, 8)} track=${args.track} imgs=${args.files.length}`,
    );

    return { collageId: collage.id, status: collage.status };
  }

  /** Ultimul colaj al unei generation (pentru owner). */
  async latestForGeneration(
    generationId: string,
    ctx: OwnerCtx,
  ): Promise<VideoCollage | null> {
    await this.assertOwnedGeneration(generationId, ctx);
    return this.repo.findOne({
      where: { generationId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Un colaj anume (verifică și ownership-ul generation-ului asociat). */
  async getForGeneration(
    generationId: string,
    collageId: string,
    ctx: OwnerCtx,
  ): Promise<VideoCollage> {
    await this.assertOwnedGeneration(generationId, ctx);
    const c = await this.repo.findOne({ where: { id: collageId, generationId } });
    if (!c) throw new NotFoundException('Colaj indisponibil');
    return c;
  }
}
