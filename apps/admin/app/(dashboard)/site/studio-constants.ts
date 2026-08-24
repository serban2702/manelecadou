export const GLOBAL_VOICE_IDS: string[] = ['male', 'female'];

export const LOCALES = ['ro', 'bg', 'sr', 'tr', 'el', 'hr', 'sl', 'bs', 'sq', 'mk', 'hu', 'en'] as const;

export const CURRENCIES = ['RON', 'EUR', 'USD', 'BGN', 'RSD', 'TRY', 'HUF', 'GBP'] as const;

export const I18N_FIELD_LOCALES = [
  'ro',
  'bg',
  'sr',
  'tr',
  'el',
  'hr',
  'sl',
  'bs',
  'sq',
  'mk',
  'hu',
  'en',
] as const;

export const PACKAGE_TIERS = ['basic', 'plus', 'premium'] as const;
export type PackageTier = (typeof PACKAGE_TIERS)[number];

/**
 * Default PACKAGES (cents). Gol pe override = aceste valori.
 *
 * Oglindesc `PACKAGES` din `apps/api/src/modules/payments/packages.ts` — ține-le
 * sincronizate. (Premium era 6999 aici și 9999 în API: adminul afișa ca
 * placeholder un preț care nu exista nicăieri.)
 */
export const PACKAGE_DEFAULTS: Record<PackageTier, { label: string; priceCents: number; hint: string }> = {
  basic: { label: 'Standard', priceCents: 2999, hint: 'Manea personalizată' },
  plus: { label: 'Plus', priceCents: 4999, hint: 'Colaj foto pe refren' },
  premium: { label: 'Premium', priceCents: 9999, hint: 'Colaj full + pagină premium' },
};

/**
 * Livrabilele moștenite când override-ul de pe design e gol. SINGURA sursă de
 * adevăr din admin — oglindește `PACKAGES` + `PACKAGE_FEATURES` din
 * `apps/api/src/modules/payments/packages.ts`. Când schimbi ceva acolo, schimbă
 * și aici (înainte exista un al doilea set duplicat în packages-editor.tsx, iar
 * ăsta era mort pe jumătate).
 */
export interface PackageFlagDefaults {
  instrumental: boolean;
  premiumPage: boolean;
  durationSec: number;
  remakes: number;
  collage: boolean;
  collagePhotoLimit: number;
  collageFullTrack: boolean;
  greetingCard: boolean;
  greetingClip: boolean;
  socialPost: boolean;
  nextSongDiscountPercent: number;
  deliveryLabel: string;
}

export const PACKAGE_FLAG_DEFAULTS: Record<PackageTier, PackageFlagDefaults> = {
  basic: {
    instrumental: false,
    premiumPage: false,
    durationSec: 90,
    remakes: 1,
    collage: false,
    collagePhotoLimit: 0,
    collageFullTrack: false,
    greetingCard: false,
    greetingClip: false,
    socialPost: false,
    nextSongDiscountPercent: 0,
    deliveryLabel: '5–10 min',
  },
  plus: {
    instrumental: false,
    premiumPage: false,
    durationSec: 150,
    remakes: 2,
    collage: true,
    collagePhotoLimit: 4,
    collageFullTrack: false,
    greetingCard: false,
    greetingClip: false,
    socialPost: false,
    nextSongDiscountPercent: 25,
    deliveryLabel: 'Livrare prioritară',
  },
  premium: {
    instrumental: false,
    premiumPage: true,
    durationSec: 150,
    remakes: 3,
    collage: true,
    collagePhotoLimit: 15,
    collageFullTrack: true,
    greetingCard: true,
    greetingClip: false,
    socialPost: true,
    nextSongDiscountPercent: 40,
    deliveryLabel: 'Livrare prioritară',
  },
};

export const LOCALE_LABELS: Record<(typeof LOCALES)[number], string> = {
  ro: 'Română',
  bg: 'Bulgară',
  sr: 'Sârbă',
  tr: 'Turcă',
  el: 'Greacă',
  hr: 'Croată',
  sl: 'Slovenă',
  bs: 'Bosniacă',
  sq: 'Albaneză',
  mk: 'Macedoneană',
  hu: 'Maghiară',
  en: 'Engleză',
};

export const CURRENCY_LABELS: Record<(typeof CURRENCIES)[number], string> = {
  RON: 'RON — lei',
  EUR: 'EUR — euro',
  USD: 'USD — dolari',
  BGN: 'BGN — leva',
  RSD: 'RSD — dinari',
  TRY: 'TRY — lire turcești',
  HUF: 'HUF — forinți',
  GBP: 'GBP — lire',
};

export const MASKED_SECRET = '__MASKED__';
