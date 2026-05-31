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
