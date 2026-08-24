/** Sume în BANI (cents RON). Tot ce expunem la API folosim cents. */
export const BASE_PRICE_RON = 2999; // 29.99 lei
export const PREMIUM_EXTRA_CENTS = 2000; // +20 lei pentru Manea Premium
export const TIP_SURCHARGE_CAP_RON = 5000; // 50 lei plafon
export const TIP_SURCHARGE_PERCENT = 0.05; // 5% din dedicație

/**
 * Sume cadou (tip) → supliment la preț. Formula: 5% din tip, capped la 50 lei.
 * Userul poate pune cât vrea la dedicație (până la 1mld), dar nu va plăti mai
 * mult de 50 lei extra la noi pentru bonus-ul de procesare.
 *
 * Ex: tip 100 lei → +5 lei. tip 1000 → +50 lei. tip 5000 → tot +50 lei (capped).
 *
 * tipAmountRON: în lei (întregi).
 */
export function tipSurchargeCents(tipAmountRON: number): number {
  if (!tipAmountRON || tipAmountRON < 0) return 0;
  const surchargeCents = Math.round(tipAmountRON * 100 * TIP_SURCHARGE_PERCENT);
  return Math.min(TIP_SURCHARGE_CAP_RON, surchargeCents);
}

export function totalPriceCents(tipAmountRON: number, premium: boolean): number {
  return (
    BASE_PRICE_RON +
    (premium ? PREMIUM_EXTRA_CENTS : 0) +
    tipSurchargeCents(tipAmountRON)
  );
}

// `packageTotalCents(tier, site.packagePricesCents)` a fost ȘTERS (2026-08-24).
// Sărea peste override-ul de preț pe interfață, deci afișa/cota alt preț decât cel
// pe care îl taxa Stripe. Prețul unui pachet se ia DOAR din
// `resolveSitePackage(site, tier, experienceSlug).priceCents`
// (`modules/experiences/package-resolve.ts`) — sursă unică pentru vitrină, checkout,
// upgrade și chat.
