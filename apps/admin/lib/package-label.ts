/**
 * Numele afișat al unui pachet, în adminul propriu-zis.
 *
 * ATENȚIE la ce NU face: nu pune prețul în etichetă. Existau două copii care
 * scriau „Bază (29,99)", „Plus (49,99)", „Premium (69,99)" — toate trei
 * învechite (Premium e 99,99 lei, iar pe site-urile în euro prețurile sunt cu
 * totul altele), și pe deasupra numeau `basic` „Bază", în timp ce clientul îl
 * vede peste tot ca „Standard". Suma reală a comenzii se afișează oricum
 * separat, din plată.
 *
 * Numele implicite oglindesc `PACKAGES` din
 * `apps/api/src/modules/payments/packages.ts`. Un site care și-a redenumit
 * pachetele din Studio are numele lui în `packageSnapshot`/payload — folosește
 * valoarea aia când o ai, iar asta doar ca rezervă.
 */
export const PACKAGE_LABELS: Record<string, string> = {
  basic: 'Standard',
  plus: 'Plus',
  premium: 'Premium',
};

export function packageLabel(tier: string | null | undefined): string {
  if (!tier) return '';
  return PACKAGE_LABELS[tier] ?? tier;
}
