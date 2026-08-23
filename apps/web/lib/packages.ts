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
    nameRO: 'Standard',
    features: [
      'Manea personalizată',
      'Versuri pe gustul tău',
      'Livrare în 5–10 minute',
      'O refacere GRATUITĂ',
    ],
    deliveryLabel: 'Livrare în 5–10 minute',
  },
  {
    tier: 'plus',
    priceCents: 4999,
    nameRO: 'Plus',
    recommended: true,
    features: [
      'Tot din Standard',
      'Colaj cu maxim 4 poze — doar refrenul',
      'Manea mai calitativă',
      'Livrare prioritară',
      '2 refaceri GRATUITE',
      '25% discount la a doua manea',
    ],
    deliveryLabel: 'Livrare prioritară',
  },
  {
    tier: 'premium',
    // Prețul de LISTĂ — trebuie să rămână identic cu `PACKAGES.premium.priceCents`
    // din API (`apps/api/src/modules/payments/packages.ts`). E doar fallback de
    // afișare: prețul real vine din quote (`/api/payments/quote`).
    priceCents: 9999,
    nameRO: 'Premium',
    features: [
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
    deliveryLabel: 'Livrare prioritară',
  },
];

export const DEFAULT_PACKAGE_TIER: PackageTier = 'basic';

/** Refacere contra cost după ce s-au epuizat cele gratuite. */
export const PAID_REMAKE_CENTS = 1500;

export function freeRemakeQuota(tier: PackageTier): number {
  return tier === 'premium' ? 3 : tier === 'plus' ? 2 : 1;
}

export function getPackage(tier: PackageTier): PackageDef {
  return PACKAGES.find((p) => p.tier === tier) ?? PACKAGES[1];
}
