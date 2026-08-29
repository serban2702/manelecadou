/**
 * Strings localizate pentru produsele afișate în Stripe Checkout.
 * Acoperă toate cele 8 locale suportate. Suplimentar mapăm la locale-ul UI
 * de Stripe Checkout (care nu suportă sr/bs — folosim 'auto' acolo).
 *
 * Convenție: {name} = brand-ul site-ului (site.stripe.productName ?? site.name),
 *           {amount} = suma dedicației, {currency} = ISO currency code.
 */

import type Stripe from 'stripe';

type StripeLocaleParam = NonNullable<Stripe.Checkout.SessionCreateParams['locale']>;

interface Pack {
  /** Nume produs pentru manea standard (90s × 2). */
  productStandard: string;
  /** Nume produs pentru manea premium (90s × 2 + premium). */
  /** Descriere — apare doar dacă userul a setat tip (dedicație). */
  /** Nume produs pentru cod cadou (per tier). */
  /** Sufix pe nume pentru pack3 / pack10. */
  pack3Suffix: string;
  pack10Suffix: string;
  /** Descriere produs pentru cod cadou. */
}

const PACKS: Record<string, Pack> = {
  ro: {
    productStandard: '{name} (90s, 2 versiuni)',
    pack3Suffix: ' — pachet 3',
    pack10Suffix: ' — pachet 10',
  },
  bg: {
    productStandard: '{name} (90s, 2 версии)',
    pack3Suffix: ' — пакет 3',
    pack10Suffix: ' — пакет 10',
  },
  sr: {
    productStandard: '{name} (90s, 2 verzije)',
    pack3Suffix: ' — paket 3',
    pack10Suffix: ' — paket 10',
  },
  tr: {
    productStandard: '{name} (90s, 2 versiyon)',
    pack3Suffix: ' — paket 3',
    pack10Suffix: ' — paket 10',
  },
  el: {
    productStandard: '{name} (90s, 2 εκδόσεις)',
    pack3Suffix: ' — πακέτο 3',
    pack10Suffix: ' — πακέτο 10',
  },
  hr: {
    productStandard: '{name} (90s, 2 verzije)',
    pack3Suffix: ' — paket 3',
    pack10Suffix: ' — paket 10',
  },
  sl: {
    productStandard: '{name} (90s, 2 različici)',
    pack3Suffix: ' — paket 3',
    pack10Suffix: ' — paket 10',
  },
  bs: {
    productStandard: '{name} (90s, 2 verzije)',
    pack3Suffix: ' — paket 3',
    pack10Suffix: ' — paket 10',
  },
};

function pack(locale: string | undefined): Pack {
  return PACKS[locale ?? 'ro'] ?? PACKS.ro;
}

function interp(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

export function productName(locale: string | undefined, brand: string): string {
  return interp(pack(locale).productStandard, { name: brand });
}

/**
 * Stripe Checkout `locale` param — UI-ul (butoane „Plătiți", labels) folosește
 * ce setăm aici. sr / bs nu sunt suportate → fallback 'auto'.
 */
const STRIPE_UI_LOCALES = new Set(['ro', 'bg', 'tr', 'el', 'hr', 'sl']);
export function stripeUiLocale(locale: string | undefined): StripeLocaleParam {
  if (locale && STRIPE_UI_LOCALES.has(locale)) return locale as StripeLocaleParam;
  return 'auto';
}
