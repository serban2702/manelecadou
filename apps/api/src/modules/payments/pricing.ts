/** Sume în BANI (cents RON). Tot ce expunem la API folosim cents. */
export const BASE_PRICE_RON = 2499; // 24,99 lei

export const TIP_SURCHARGE_CAP_RON = 15000; // 150 lei

/**
 * Sume cadou (tip) → supliment (10% până la 150 lei, apoi flat 150).
 * tipAmountRON: în lei (întregi).
 */
export function tipSurchargeCents(tipAmountRON: number): number {
  if (!tipAmountRON || tipAmountRON < 0) return 0;
  const tenPercentCents = Math.round(tipAmountRON * 100 * 0.1);
  return Math.min(TIP_SURCHARGE_CAP_RON, tenPercentCents);
}

export function totalPriceCents(tipAmountRON: number): number {
  return BASE_PRICE_RON + tipSurchargeCents(tipAmountRON);
}
