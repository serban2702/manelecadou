// Mirror al contractului de pachete (backend: Generation.packageTier).
// Prețurile reale vin din quote API (`/api/payments/quote?packageTier=`);
// `priceCents` de aici e doar fallback de afișare până se încarcă quote-ul.

export type PackageTier = 'basic' | 'plus' | 'premium';

export interface PackageDef {
  tier: PackageTier;
  /** Preț default în cents (RON). Fallback până vine quote-ul real. */
  priceCents: number;
  /** Nume afișat (RO). */
  nameRO: string;
  /** Bullets cu ce include pachetul. */
  features: string[];
  /** Etichetă de livrare (timp estimat). */
  deliveryLabel: string;
  /** True pentru pachetul evidențiat ca „RECOMANDAT". */
  recommended?: boolean;
}

export const PACKAGES: PackageDef[] = [
  {
    tier: 'basic',
    priceCents: 2999,
    nameRO: 'Pachet de bază',
    features: [
      'Maneaua personalizată cu numele destinatarului',
      'Versuri profesioniste',
    ],
    deliveryLabel: 'Livrare în 15-60 minute',
  },
  {
    tier: 'plus',
    priceCents: 4999,
    nameRO: 'Pachet Plus',
    recommended: true,
    features: [
      'Tot din pachetul de bază',
      'Poză pentru TikTok / Facebook / Instagram (4 variante generate + poți încărca a ta)',
    ],
    deliveryLabel: 'Livrare în 10-15 minute',
  },
  {
    tier: 'premium',
    priceCents: 6999,
    nameRO: 'Pachet Premium',
    features: [
      'Tot din pachetul Plus',
      'Pagină premium pentru ascultare',
      'Durată mai lungă a melodiei',
      'Videoclip personalizat',
    ],
    deliveryLabel: 'Livrare în 3-5 minute',
  },
];

export const DEFAULT_PACKAGE_TIER: PackageTier = 'basic';

export function getPackage(tier: PackageTier): PackageDef {
  return PACKAGES.find((p) => p.tier === tier) ?? PACKAGES[1];
}
