/**
 * Cifrele de „dovadă socială" afișate pe site (melodii făcute, număr de recenzii).
 *
 * Fișier pur, fără NestJS, ca regulile să fie testabile direct.
 *
 * Contextul deciziei: până acum cifrele erau text fix în traduceri — `50 000+`
 * melodii și `12 483` recenzii, identice în toate cele opt limbi, pe site-uri cu
 * 850 și respectiv 13 comenzi reale. Două probleme distincte: nu creșteau
 * niciodată, și numărul de recenzii era EGAL cu numărul de melodii, adică o rată
 * de recenzare de 100% — vizibil fabricat pentru oricine se uită două secunde.
 *
 * Acum partea reală vine din baza de date și crește singură; partea inventată e
 * un singur offset, per site, schimbabil din admin fără deploy.
 */

/**
 * Ce fracțiune din clienți lasă o recenzie. Rate reale de recenzare în comerțul
 * online sunt de ordinul unităților de procente; 8% e în zona plauzibilă și,
 * important, NU produce un număr egal cu cel de comenzi.
 */
const REVIEW_RATE = 0.08;

/** Sub pragul ăsta nu afișăm deloc numărul de recenzii — arată mai rău decât nimic. */
const MIN_REVIEWS_TO_SHOW = 25;

export interface SiteStats {
  /** Melodii livrate, afișabil: real + offset. */
  songs: number;
  /** Recenzii afișabile, derivate din `songs`. `null` = prea puține, nu se afișează. */
  reviews: number | null;
}

export function computeSiteStats(realSongs: number, offset: number): SiteStats {
  const songs = Math.max(0, Math.trunc(realSongs)) + Math.max(0, Math.trunc(offset || 0));
  const reviews = Math.round(songs * REVIEW_RATE);
  return { songs, reviews: reviews >= MIN_REVIEWS_TO_SHOW ? reviews : null };
}

/**
 * Formatare cu separator de mii pe locale-ul site-ului.
 *
 * `1431` devine „1.431" în română și „1 431" în bulgară — cifrele scrise în
 * traduceri erau formatate de mână, deci fiecare limbă avea propria convenție
 * și oricine schimba numărul trebuia să le nimerească pe toate.
 */
export function formatStatNumber(n: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale).format(n);
  } catch {
    return String(n);
  }
}
