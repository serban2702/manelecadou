import { Injectable } from '@nestjs/common';

import type { Generation } from '../generations/generation.entity';
import type { IGenerationMediaService } from './media.types';
import { SocialImageService } from './social-image.service';
import { VideoService } from './video.service';

/**
 * Fațada publică a modulului media. Implementează `IGenerationMediaService`
 * și delegă către cele două servicii specializate. Acesta e providerul pe
 * care îl injectează generations (token: clasa `GenerationMediaService` sau
 * `GENERATION_MEDIA_SERVICE`).
 */
@Injectable()
export class GenerationMediaService implements IGenerationMediaService {
  constructor(
    private readonly socialImages: SocialImageService,
    private readonly video: VideoService,
  ) {}

  generateSocialImages(gen: Generation): Promise<string[]> {
    return this.socialImages.generateSocialImages(gen);
  }

  generateVideo(
    gen: Generation,
    opts?: { audioPath?: string; outName?: string },
  ): Promise<string | null> {
    return this.video.generateVideo(gen, opts);
  }
}
