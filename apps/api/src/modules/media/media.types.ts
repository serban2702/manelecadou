import type { Generation } from '../generations/generation.entity';

/**
 * Contractul public al modulului media. Alt cod (generations) injectează
 * `GenerationMediaService` și se bazează pe EXACT aceste semnături.
 *
 * Ambele metode sunt graceful: NU aruncă niciodată. La eșec:
 *  - `generateSocialImages` întoarce `[]`
 *  - `generateVideo` întoarce `null`
 */
export interface IGenerationMediaService {
  /** Generează 4 variante de imagine social-share „stil Spotify" (PNG 1080x1080).
   *  Întoarce 4 URL-uri publice (`/uploads/social/<id>/v1.png` ...) sau `[]` la eșec. */
  generateSocialImages(gen: Generation): Promise<string[]>;

  /** Generează un videoclip slideshow MP4 din imaginea socială + audio full.
   *  Întoarce URL-ul public (`/uploads/video/<id>/clip.mp4`) sau `null` la eșec. */
  generateVideo(gen: Generation): Promise<string | null>;
}

/** Token de injecție (DI) pentru contractul de mai sus. */
export const GENERATION_MEDIA_SERVICE = 'GENERATION_MEDIA_SERVICE';
