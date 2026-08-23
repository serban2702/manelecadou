/**
 * Bani: UI = unități majore (29,99), stocare = cents (2999).
 * Modelul e mereu /100. HUF zero-decimal Stripe nu e în scope.
 */

export function majorToCents(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function centsToMajor(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

export function currencySuffix(currency: string): string {
  const map: Record<string, string> = {
    RON: 'lei',
    EUR: '€',
    USD: '$',
    BGN: 'лв',
    RSD: 'RSD',
    TRY: '₺',
    HUF: 'Ft',
    GBP: '£',
  };
  return map[currency] ?? currency.toLowerCase();
}
