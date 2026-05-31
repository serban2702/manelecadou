/** Numele cozii BullMQ pentru montarea colajelor video.
 *  Extras separat ca să-l împartă service-ul (enqueue) și processor-ul. */
export const COLLAGE_QUEUE = 'collage';

/** Durata afișării fiecărei imagini (secunde). */
export const SLIDE_DURATION_SEC = 7;

/** Durata tranziției xfade între imagini (secunde). */
export const TRANSITION_SEC = 1;

/** Numărul maxim de imagini acceptate per colaj. */
export const MAX_IMAGES = 15;

/** Mărimea maximă a unui fișier imagine (bytes). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Tranzițiile xfade ciclate între imagini (5 tipuri). */
export const TRANSITIONS = [
  'fade',
  'slideleft',
  'wiperight',
  'circleopen',
  'dissolve',
] as const;

/** Formatele (aspect ratio) disponibile pentru colaj + image-video. */
export type CollageAspect = '9x16' | '1x1' | '16x9';

export const COLLAGE_ASPECTS: CollageAspect[] = ['9x16', '1x1', '16x9'];

/** Dimensiunile canvas-ului (W×H) pentru fiecare format. */
export const ASPECT_DIMS: Record<CollageAspect, { w: number; h: number }> = {
  '9x16': { w: 1080, h: 1920 }, // TikTok / Instagram story
  '1x1': { w: 1080, h: 1080 }, // postare Instagram (pătrat)
  '16x9': { w: 1920, h: 1080 }, // videoclip YouTube
};

export function isCollageAspect(v: unknown): v is CollageAspect {
  return v === '9x16' || v === '1x1' || v === '16x9';
}

export function normalizeAspect(v: unknown): CollageAspect {
  return isCollageAspect(v) ? v : '9x16';
}
