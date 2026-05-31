import { Module } from '@nestjs/common';

import { SocialImageService } from './social-image.service';
import { VideoService } from './video.service';
import { GenerationMediaService } from './generation-media.service';
import { RemoteMediaClient } from './remote-media.client';
import { GENERATION_MEDIA_SERVICE } from './media.types';

/**
 * Modul media — generare server-side de imagini social-share (stil Spotify)
 * și videoclipuri slideshow. ConfigModule e global în app, deci ConfigService
 * e disponibil fără import explicit.
 *
 * Exportă atât clasa `GenerationMediaService` (token concret) cât și
 * `GENERATION_MEDIA_SERVICE` (token de interfață) — generations poate injecta
 * oricare. Importă acest modul în `GenerationsModule`.
 */
@Module({
  providers: [
    RemoteMediaClient,
    SocialImageService,
    VideoService,
    GenerationMediaService,
    { provide: GENERATION_MEDIA_SERVICE, useExisting: GenerationMediaService },
  ],
  exports: [GenerationMediaService, GENERATION_MEDIA_SERVICE, RemoteMediaClient],
})
export class MediaModule {}
