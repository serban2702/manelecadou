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
  productPremium: string;
  /** Descriere — apare doar dacă userul a setat tip (dedicație). */
  dedicationDescription: string;
  /** Nume produs pentru cod cadou (per tier). */
  giftProduct: string;
  /** Sufix pe nume pentru pack3 / pack10. */
  pack3Suffix: string;
  pack10Suffix: string;
  /** Descriere produs pentru cod cadou. */
  giftDescription: string;
}

const PACKS: Record<string, Pack> = {
  ro: {
    productStandard: '{name} (90s, 2 versiuni)',
    productPremium: '{name} — Premium (90s, 2 versiuni)',
    dedicationDescription: 'Include dedicație de {amount} {currency} în versuri.',
    giftProduct: '🎁 {name} (cod cadou)',
    pack3Suffix: ' — pachet 3',
    pack10Suffix: ' — pachet 10',
    giftDescription: 'Cod cadou trimis pe email — îl folosești tu sau îl dai cui vrei.',
  },
  bg: {
    productStandard: '{name} (90s, 2 версии)',
    productPremium: '{name} — Premium (90s, 2 версии)',
    dedicationDescription: 'Включва посвещение от {amount} {currency} в текста.',
    giftProduct: '🎁 {name} (подаръчен код)',
    pack3Suffix: ' — пакет 3',
    pack10Suffix: ' — пакет 10',
    giftDescription: 'Подаръчен код, изпратен по имейл — използвай го сам или го дай на когото искаш.',
  },
  sr: {
    productStandard: '{name} (90s, 2 verzije)',
    productPremium: '{name} — Premium (90s, 2 verzije)',
    dedicationDescription: 'Uključuje posvetu od {amount} {currency} u tekstu.',
    giftProduct: '🎁 {name} (poklon kod)',
    pack3Suffix: ' — paket 3',
    pack10Suffix: ' — paket 10',
    giftDescription: 'Poklon kod poslat na email — koristiš ga sam ili daješ kome želiš.',
  },
  tr: {
    productStandard: '{name} (90s, 2 versiyon)',
    productPremium: '{name} — Premium (90s, 2 versiyon)',
    dedicationDescription: 'Sözlerde {amount} {currency} ithaf içerir.',
    giftProduct: '🎁 {name} (hediye kodu)',
    pack3Suffix: ' — paket 3',
    pack10Suffix: ' — paket 10',
    giftDescription: 'E-postaya gönderilen hediye kodu — kendin kullanabilir ya da istediğine verebilirsin.',
  },
  el: {
    productStandard: '{name} (90s, 2 εκδόσεις)',
    productPremium: '{name} — Premium (90s, 2 εκδόσεις)',
    dedicationDescription: 'Περιλαμβάνει αφιέρωση {amount} {currency} στους στίχους.',
    giftProduct: '🎁 {name} (κωδικός δώρου)',
    pack3Suffix: ' — πακέτο 3',
    pack10Suffix: ' — πακέτο 10',
    giftDescription: 'Κωδικός δώρου που στέλνεται με email — τον χρησιμοποιείς εσύ ή τον δίνεις σε όποιον θέλεις.',
  },
  hr: {
    productStandard: '{name} (90s, 2 verzije)',
    productPremium: '{name} — Premium (90s, 2 verzije)',
    dedicationDescription: 'Uključuje posvetu od {amount} {currency} u tekstu.',
    giftProduct: '🎁 {name} (poklon kod)',
    pack3Suffix: ' — paket 3',
    pack10Suffix: ' — paket 10',
    giftDescription: 'Poklon kod poslan na email — koristiš ga sam ili daješ kome želiš.',
  },
  sl: {
    productStandard: '{name} (90s, 2 različici)',
    productPremium: '{name} — Premium (90s, 2 različici)',
    dedicationDescription: 'Vključuje posvetilo {amount} {currency} v besedilu.',
    giftProduct: '🎁 {name} (darilna koda)',
    pack3Suffix: ' — paket 3',
    pack10Suffix: ' — paket 10',
    giftDescription: 'Darilna koda poslana po emailu — uporabiš jo sam ali jo daš komu želiš.',
  },
  bs: {
    productStandard: '{name} (90s, 2 verzije)',
    productPremium: '{name} — Premium (90s, 2 verzije)',
    dedicationDescription: 'Uključuje posvetu od {amount} {currency} u tekstu.',
    giftProduct: '🎁 {name} (poklon kod)',
    pack3Suffix: ' — paket 3',
    pack10Suffix: ' — paket 10',
    giftDescription: 'Poklon kod poslan na email — koristiš ga sam ili daješ kome želiš.',
  },
};

function pack(locale: string | undefined): Pack {
  return PACKS[locale ?? 'ro'] ?? PACKS.ro;
}

function interp(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

export function productName(locale: string | undefined, brand: string, premium: boolean): string {
  const p = pack(locale);
  return interp(premium ? p.productPremium : p.productStandard, { name: brand });
}

export function dedicationDescription(locale: string | undefined, amount: number, currency: string): string {
  return interp(pack(locale).dedicationDescription, { amount, currency });
}

export function giftProductName(locale: string | undefined, brand: string, tier: 'single' | 'pack3' | 'pack10'): string {
  const p = pack(locale);
  const base = interp(p.giftProduct, { name: brand });
  if (tier === 'pack3') return base + p.pack3Suffix;
  if (tier === 'pack10') return base + p.pack10Suffix;
  return base;
}

export function giftDescription(locale: string | undefined): string {
  return pack(locale).giftDescription;
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
