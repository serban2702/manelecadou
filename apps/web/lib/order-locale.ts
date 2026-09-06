import { normalizeLocale } from '@/i18n/locales';

/**
 * `/m/<uuid>` și `/m/<uuid>/orice` — singurele rute a căror limbă o dă COMANDA,
 * nu site-ul vizitat. Vezi `lib/delivery-locale.ts`.
 */
const DELIVERY_PATH =
  /^\/m\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;

/** Id-ul comenzii dacă `pathname` e o pagină de livrare, altfel `null`. */
export function deliveryIdFromPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  return DELIVERY_PATH.exec(pathname)?.[1]?.toLowerCase() ?? null;
}

/**
 * Limba cu care pleacă o comandă spre server.
 *
 * Regula: limba trimisă explicit de apelant, altfel limba rezolvată a
 * site-ului. `'ro'` doar când nu știm nimic — niciodată ca prim răspuns.
 *
 * Scrisă ca funcție, nu inline în `api.ts`, din două motive:
 *
 *  1. **Se aplică în două locuri** (`createGeneration` și `checkout-direct`).
 *     Al doilea o pierduse complet — și e singurul folosit de când s-a scos
 *     demo-ul, deci fiecare comandă bulgară plecase fără limbă și se scrisese
 *     `ro` în baza de date.
 *  2. **Forma contează.** Varianta evidentă, `{ locale: current, ...input }`,
 *     e greșită: spread-ul copiază și cheile cu `undefined`, deci un apelant
 *     care trimite `locale: undefined` ȘTERGE valoarea completată. Aici nu se
 *     poate scrie greșit.
 */
export function orderLocale(explicit: unknown, current: unknown): string {
  return normalizeLocale(explicit) ?? normalizeLocale(current) ?? 'ro';
}

/**
 * `generation` cu limba completată — forma folosită în payload-urile de comandă.
 *
 * `T extends object`, nu `T extends { locale?: string }`: al doilea e un „weak
 * type" pentru TypeScript, iar un obiect fără cheia `locale` — adică exact ce
 * trimit wizardurile — n-ar fi fost acceptat.
 */
export function withOrderLocale<T extends object>(
  generation: T,
  current: unknown,
): Omit<T, 'locale'> & { locale: string } {
  const explicit = (generation as { locale?: unknown }).locale;
  return { ...generation, locale: orderLocale(explicit, current) };
}
