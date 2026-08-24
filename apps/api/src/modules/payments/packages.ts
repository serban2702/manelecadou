/**
 * Modelul de PACHETE (înlocuiește vechiul base + tip + premium).
 * 3 niveluri: basic / plus / premium. Prețul e în BANI (cents RON), overridable
 * per-site prin Site.packagePricesCents.
 *
 * Fiecare pachet definește ce LIVRABILE include:
 *  - song:        maneaua personalizată (toate pachetele)
 *  - instrumental: track instrumental separat
 *  - premiumPage:  pagină premium de ascultare (premium)
 *  - durationSec:  durata țintă a melodiei
 *  - greetingClip: clip de urare AI (Veo) — setare; generarea vine mai târziu
 *  - deliveryLabel: copy de marketing pentru timpul de livrare (nu garantat tehnic)
 *
 * Imagini social + videoclip pe piesă (refren) au fost scoase.
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
    // Label-ul VIZIBIL clientului. Cheia internă rămâne `basic`, dar peste tot în chat
    // (chatPackageUpsellRo) și pe site pachetul de intrare se numește „Standard".
    // BUG observat 2026-07-31 conv 18e99e1e: Irina i-a prezentat clientei „Standard 29.99",
    // ea a ales „Pachetul standard", iar cardul de plată i-a venit „pachet Basic" — un nume
    // de pachet pe care nu-l auzise niciodată, chiar în momentul plății.
    label: 'Standard',
    priceCents: 2999,
    durationSec: 90,
    instrumental: false,
    socialImage: false,
    video: false,
    premiumPage: false,
    deliveryLabel: '5–10 min',
    featuresRo: [
      'Manea personalizată',
      'Versuri pe gustul tău',
      'Livrare în 5–10 minute',
      'O refacere GRATUITĂ',
    ],
  },
  plus: {
    tier: 'plus',
    label: 'Plus',
    priceCents: 4999,
    durationSec: 150,
    instrumental: false,
    socialImage: false,
    video: false,
    premiumPage: false,
    deliveryLabel: 'Livrare prioritară',
    featuresRo: [
      'Tot din Standard',
      'Colaj cu maxim 4 poze — doar refrenul',
      'Manea mai calitativă',
      'Livrare prioritară',
      '2 refaceri GRATUITE',
      '25% discount la a doua manea',
    ],
  },
  premium: {
    tier: 'premium',
    label: 'Premium',
    // Prețul de LISTĂ (99.99 lei). Site-urile de producție au override în
    // `site.packagePricesCents`; valoarea de aici e ce primește un site nou.
    priceCents: 9999,
    durationSec: 150,
    instrumental: false,
    socialImage: false,
    video: false,
    premiumPage: true,
    deliveryLabel: 'Livrare prioritară',
    featuresRo: [
      'Tot din Plus',
      'Colaj cu 15 poze și toată melodia',
      'Felicitare personalizată',
      'Manea mai lungă',
      'Support prioritar',
      'Livrare prioritară',
      '3 refaceri GRATUITE',
      '40% discount la următoarea manea',
      'Postare pe Facebook și TikTok, cu dedicație',
    ],
  },
};

export function isPackageTier(v: unknown): v is PackageTier {
  return v === 'basic' || v === 'plus' || v === 'premium';
}

export function normalizeTier(v: unknown): PackageTier {
  return isPackageTier(v) ? v : 'basic';
}

/**
 * Refacere contra cost după ce s-au epuizat cele gratuite.
 *
 * Valoare de rezervă, în RON. NU o folosi direct pentru afișare sau taxare —
 * folosește `paidRemakeCentsFor(basicPriceCents)`.
 */
export const PAID_REMAKE_CENTS = 1500;

/** Cât din prețul pachetului de intrare costă o refacere plătită. */
const PAID_REMAKE_RATIO = 0.5;
/** Sub pragul ăsta Stripe refuză plata. */
const STRIPE_MIN_CENTS = 200;

/**
 * Prețul unei refaceri plătite, în moneda site-ului.
 *
 * Se derivă din pachetul de intrare al tenantului, nu dintr-o constantă:
 * 1500 „cenți" înseamnă 15 lei în România, dar 15 EURO pe site-ul grecesc,
 * unde toată melodia costă 7,99 € — adică refacerea ajungea de aproape două ori
 * mai scumpă decât produsul. Cu raportul de mai jos, România rămâne EXACT la 15
 * lei (2999 × 0,5 = 1500), iar celelalte piețe primesc o sumă proporțională.
 */
export function paidRemakeCentsFor(basicPriceCents?: number | null): number {
  const base =
    typeof basicPriceCents === 'number' && Number.isFinite(basicPriceCents) && basicPriceCents > 0
      ? basicPriceCents
      : PACKAGES.basic.priceCents;
  return Math.max(STRIPE_MIN_CENTS, Math.round(base * PAID_REMAKE_RATIO));
}

export interface PackageFeatureDefaults {
  remakes: number;
  collage: boolean;
  collagePhotoLimit: number;
  collageFullTrack: boolean;
  greetingCard: boolean;
  socialPost: boolean;
  nextSongDiscountPercent: number;
  /** Clip de urare AI (Veo). Generarea nu e pornită încă. */
  greetingClip: boolean;
}

export const PACKAGE_FEATURES: Record<PackageTier, PackageFeatureDefaults> = {
  basic: {
    remakes: 1,
    collage: false,
    collagePhotoLimit: 0,
    collageFullTrack: false,
    greetingCard: false,
    socialPost: false,
    nextSongDiscountPercent: 0,
    greetingClip: false,
  },
  plus: {
    remakes: 2,
    collage: true,
    collagePhotoLimit: 4,
    collageFullTrack: false,
    greetingCard: false,
    socialPost: false,
    nextSongDiscountPercent: 25,
    greetingClip: false,
  },
  premium: {
    remakes: 3,
    collage: true,
    collagePhotoLimit: 15,
    collageFullTrack: true,
    greetingCard: true,
    socialPost: true,
    nextSongDiscountPercent: 40,
    greetingClip: false,
  },
};

/** Câte refaceri gratuite: override din snapshot/admin, altfel Standard 1 / Plus 2 / Premium 3. */
export function freeRemakeQuota(tier: unknown, remakesOverride?: number | null): number {
  if (typeof remakesOverride === 'number' && Number.isFinite(remakesOverride) && remakesOverride >= 0) {
    return Math.round(remakesOverride);
  }
  const t = normalizeTier(tier);
  return PACKAGE_FEATURES[t].remakes;
}

export function freeRemakesUsed(g: {
  freeRemakeUsedCount?: number | null;
  freeRemakeUsedAt?: Date | string | null;
}): number {
  const n = g.freeRemakeUsedCount ?? 0;
  return Math.max(n, g.freeRemakeUsedAt ? 1 : 0);
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

/**
 * Prețul „tăiat" (compare-at / anchor) de AFIȘARE pentru un tier, cents.
 * PUR marketing — nu afectează checkout-ul. Returnează valoarea doar dacă e
 * strict mai mare decât prețul real al tier-ului (altfel n-are sens să-l tai).
 */
export function packageCompareAtCents(
  tier: PackageTier,
  compareOverrides?: Partial<Record<PackageTier, number>> | null,
  priceOverrides?: Partial<Record<PackageTier, number>> | null,
): number | null {
  const c = compareOverrides?.[tier];
  if (typeof c !== 'number' || c <= 0) return null;
  const real = packagePriceCents(tier, priceOverrides);
  return c > real ? c : null;
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
 *  - Plus     = plus  (mai lungă + colaj 4 poze)
 *  - Premium  = premium (colaj 15 poze + felicitare + pagină premium)
 * Folosit în ETAPA de alegere a pachetului, înainte de linkul de plată.
 */
/** Cuvântul natural pentru monedă, folosit în chat (mai uman decât codul ISO). */
export function currencyWord(currency?: string | null): string {
  switch ((currency ?? 'RON').toUpperCase()) {
    case 'RON':
      return 'lei';
    case 'EUR':
      return 'euro';
    case 'BGN':
      return 'leva';
    default:
      return currency ?? 'lei';
  }
}

export function chatPackageUpsellRo(
  overrides?: Partial<Record<PackageTier, number>> | null,
  opts?: {
    compareAt?: Partial<Record<PackageTier, number>> | null;
    currency?: string | null;
  },
): string {
  const cur = currencyWord(opts?.currency);
  const fmt = (cents: number) => (cents / 100).toFixed(2);
  const standard = fmt(packagePriceCents('basic', overrides));
  const plus = fmt(packagePriceCents('plus', overrides));
  const premium = fmt(packagePriceCents('premium', overrides));
  const plusCompare = packageCompareAtCents('plus', opts?.compareAt, overrides);
  const plusLine = plusCompare
    ? `Plus ${plus} ${cur} (redus de la ${fmt(plusCompare)} ${cur} — oferta valabila inca 3 zile) — mai lunga, cu colaj 4 poze pe refren; `
    : `Plus ${plus} ${cur} — colaj 4 poze (refren), manea mai calitativa, 2 refaceri si 25% la a doua manea; `;
  return (
    `Avem 3 pachete: Standard ${standard} ${cur} — maneaua ta in 5-10 minute, cu o refacere gratuita; ` +
    plusLine +
    `Premium ${premium} ${cur} — colaj cu 15 poze, felicitare, 3 refaceri gratuite si postare pe Facebook/TikTok. Ce alegi?`
  );
}
