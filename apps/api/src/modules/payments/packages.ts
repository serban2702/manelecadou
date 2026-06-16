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
  /** Nume afișat (UI + chat). */
  label: string;
  /** Preț default (cents RON). Site-ul poate suprascrie via packagePricesCents. */
  priceCents: number;
  durationSec: number;
  instrumental: boolean;
  socialImage: boolean;
  video: boolean;
  premiumPage: boolean;
  /** Copy marketing — timp estimat de livrare. */
  deliveryLabel: string;
  /** Descriere scurtă a livrabilelor (pentru Irina + carduri). */
  featuresRo: string[];
}

export const PACKAGES: Record<PackageTier, PackageDef> = {
  basic: {
    tier: 'basic',
    label: 'Basic',
    priceCents: 2999,
    durationSec: 90,
    instrumental: false,
    socialImage: false,
    video: false,
    premiumPage: false,
    deliveryLabel: '15-60 min',
    featuresRo: ['Manea personalizată', 'Versuri personalizate', 'Livrare pe email'],
  },
  plus: {
    tier: 'plus',
    label: 'Plus',
    priceCents: 4999,
    durationSec: 150,
    instrumental: false,
    socialImage: true,
    video: false,
    premiumPage: false,
    deliveryLabel: '10-15 min',
    featuresRo: [
      'Tot ce e în Basic',
      'Manea mai calitativă, cu instrumental mai bun și puțin mai lungă',
      '4 imagini social-media (TikTok/Instagram/Facebook)',
      'Livrare mai rapidă',
    ],
  },
  premium: {
    tier: 'premium',
    label: 'Premium',
    priceCents: 6999,
    durationSec: 150,
    instrumental: false,
    socialImage: true,
    video: true,
    premiumPage: true,
    deliveryLabel: '3-5 min',
    featuresRo: [
      'Tot ce e în Plus',
      'Videoclip personalizat',
      'Pagină premium de ascultare',
      'Melodie mai lungă',
      'Colaj video din pozele tale',
    ],
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

/** Numele afișat al pachetului (ex. 'Premium'). */
export function packageLabel(tier: PackageTier): string {
  return PACKAGES[tier].label;
}

/**
 * Pitch text pentru toate pachetele (folosit de Irina înainte de link plată).
 * Prețurile reflectă override-urile per-site dacă există.
 */
export function packagesPitchRo(
  overrides?: Partial<Record<PackageTier, number>> | null,
): string {
  return PACKAGE_TIERS.map((tier) => {
    const d = PACKAGES[tier];
    const price = (packagePriceCents(tier, overrides) / 100).toFixed(2);
    return `${d.label} (${price} lei): ${d.featuresRo.join(', ')}.`;
  }).join(' ');
}

/**
 * Pitch pentru chat-ul Irinei — TOATE 3 pachetele (decizie owner 2026-06-13, review-uri
 * admin: clienții trebuie să vadă și varianta de 69.99, nu doar standard + plus):
 *  - Standard = basic (preț de intrare, maneaua personalizată)
 *  - Plus     = plus  (mai lungă + mai calitativă + imagini social media)
 *  - Premium  = premium (tot ce e în Plus + videoclip + pagină premium)
 * Folosit în ETAPA de alegere a pachetului, înainte de linkul de plată.
 */
export function chatPackageUpsellRo(
  overrides?: Partial<Record<PackageTier, number>> | null,
): string {
  const standard = (packagePriceCents('basic', overrides) / 100).toFixed(2);
  const plus = (packagePriceCents('plus', overrides) / 100).toFixed(2);
  const premium = (packagePriceCents('premium', overrides) / 100).toFixed(2);
  return (
    `Avem 3 pachete: Standard ${standard} lei — maneaua ta personalizata; ` +
    `Plus ${plus} lei — mai lunga si mai calitativa, cu imagini pentru social media (TikTok/Instagram); ` +
    `Premium ${premium} lei — tot ce e in Plus plus videoclip si pagina premium de ascultare. Ce alegi?`
  );
}
