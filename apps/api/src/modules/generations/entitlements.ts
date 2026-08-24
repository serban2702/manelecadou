import {
  PACKAGES,
  PACKAGE_FEATURES,
  freeRemakeQuota,
  normalizeTier,
} from '../payments/packages';
import type { PackageSnapshot } from '../experiences/types';

/**
 * Ce livrabile i s-au VÂNDUT efectiv comenzii — forma pe care o vede clientul.
 *
 * Sursa de adevăr e `generation.packageSnapshot`, înghețat la crearea comenzii:
 * clientul primește exact ce i s-a promis când a plătit, chiar dacă pachetele
 * s-au schimbat între timp. Nu e snapshotul brut, ci strict câmpurile de care
 * are nevoie pagina melodiei ca să decidă ce arată.
 */
export interface GenerationEntitlements {
  /** Numele pachetului, pentru afișare (ex. „Premium"). */
  label: string;
  collage: boolean;
  /** Câte poze acceptă colajul. 0 = fără colaj. */
  collagePhotoLimit: number;
  /** true = colaj pe toată melodia; false = doar pe refren. */
  collageFullTrack: boolean;
  premiumPage: boolean;
  greetingCard: boolean;
  greetingClip: boolean;
  socialPost: boolean;
  instrumental: boolean;
  /** Refaceri gratuite incluse. */
  remakes: number;
  durationSec: number;
  nextSongDiscountPercent: number;
  /**
   * Livrabile SCOASE din ofertă, păstrate pentru comenzile vândute cu ele:
   * clipul vertical pe refren și pozele de share. Pe pachetele de azi sunt
   * mereu false — de aceea nu le mai anunțăm nimănui altcuiva.
   */
  chorusClip: boolean;
  shareImages: boolean;
}

/** Doar câmpurile de care are nevoie derivarea — merge și pe entitate, și pe un rând parțial. */
export interface EntitlementsInput {
  packageTier?: string | null;
  packageSnapshot?: PackageSnapshot | null;
  durationSec?: number | null;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * Drepturile efective ale unei comenzi.
 *
 * Comenzile de dinainte de `packageSnapshot` (coloana e nouă) au snapshot NULL —
 * pentru ele cădem pe drepturile implicite ale tier-ului lor, ca un client vechi
 * să nu piardă acces la ceva ce vedea ieri.
 */
export function generationEntitlements(gen: EntitlementsInput): GenerationEntitlements {
  const tier = normalizeTier(gen.packageTier);
  const def = PACKAGES[tier];
  const feat = PACKAGE_FEATURES[tier];
  const snap = gen.packageSnapshot ?? null;

  const collage = bool(snap?.collage, feat.collage);
  return {
    label: def.label,
    collage,
    // Fără dreptul la colaj, limita e 0 — nu moștenim un plafon dintr-un pachet
    // pe care clientul nu l-a cumpărat.
    collagePhotoLimit: collage ? num(snap?.collagePhotoLimit, feat.collagePhotoLimit) : 0,
    collageFullTrack: collage ? bool(snap?.collageFullTrack, feat.collageFullTrack) : false,
    premiumPage: bool(snap?.premiumPage, def.premiumPage),
    greetingCard: bool(snap?.greetingCard, feat.greetingCard),
    greetingClip: bool(snap?.greetingClip, feat.greetingClip),
    socialPost: bool(snap?.socialPost, feat.socialPost),
    instrumental: bool(snap?.instrumental, def.instrumental),
    remakes: freeRemakeQuota(tier, snap?.remakes ?? null),
    durationSec: num(snap?.durationSec, num(gen.durationSec, def.durationSec)),
    nextSongDiscountPercent: num(snap?.nextSongDiscountPercent, feat.nextSongDiscountPercent),
    chorusClip: bool(snap?.video, def.video),
    shareImages: bool(snap?.socialImage, def.socialImage),
  };
}
