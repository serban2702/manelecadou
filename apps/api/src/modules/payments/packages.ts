/**
 * Modelul de PACHETE (înlocuiește vechiul base + tip + premium).
 * 3 niveluri: basic / plus / premium. Prețul e în BANI (cents RON), overridable
 * per-site prin Site.packagePricesCents.
 *
 * Fiecare pachet definește ce LIVRABILE include:
 *  - song:        maneaua personalizată (toate pachetele)
 *  - instrumental: track instrumental separat (plus, premium)
 *  - socialImage:  4 variante de imagine social-share + upload propriu (plus, premium)
 *  - video:        videoclip slideshow generat (premium)
 *  - premiumPage:  pagină premium de ascultare (premium)
 *  - durationSec:  durata țintă a melodiei (premium = mai lungă)
 *  - deliveryLabel: copy de marketing pentru timpul de livrare (nu garantat tehnic)
 */

export type PackageTier = 'basic' | 'plus' | 'premium';

export const PACKAGE_TIERS: PackageTier[] = ['basic', 'plus', 'premium'];

export interface PackageDef {
  tier: PackageTier;
  /** Preț default (cents RON). Site-ul poate suprascrie via packagePricesCents. */
  priceCents: number;
  durationSec: number;
  instrumental: boolean;
  socialImage: boolean;
  video: boolean;
  premiumPage: boolean;
  /** Copy marketing — timp estimat de livrare. */
  deliveryLabel: string;
}

export const PACKAGES: Record<PackageTier, PackageDef> = {
  basic: {
    tier: 'basic',
    priceCents: 2999,
    durationSec: 90,
    instrumental: false,
    socialImage: false,
    video: false,
    premiumPage: false,
    deliveryLabel: '15-60 min',
  },
  plus: {
    tier: 'plus',
    priceCents: 4999,
    durationSec: 90,
    instrumental: false,
    socialImage: true,
    video: false,
    premiumPage: false,
    deliveryLabel: '10-15 min',
  },
  premium: {
    tier: 'premium',
    priceCents: 6999,
    durationSec: 150,
    instrumental: false,
    socialImage: true,
    video: true,
    premiumPage: true,
    deliveryLabel: '3-5 min',
  },
};

export function isPackageTier(v: unknown): v is PackageTier {
  return v === 'basic' || v === 'plus' || v === 'premium';
}

export function normalizeTier(v: unknown): PackageTier {
  return isPackageTier(v) ? v : 'basic';
}

/** Prețul efectiv al unui pachet, cu override per-site (cents). */
export function packagePriceCents(
  tier: PackageTier,
  overrides?: Partial<Record<PackageTier, number>> | null,
): number {
  const o = overrides?.[tier];
  if (typeof o === 'number' && o > 0) return o;
  return PACKAGES[tier].priceCents;
}

export function packageDef(tier: PackageTier): PackageDef {
  return PACKAGES[tier];
}
