import type { SiteConfig } from './site-shared';

/**
 * Umple cifrele de dovadă socială într-un text care conține `{count}` /
 * `{reviews}`.
 *
 * Textele astea sunt HTML (au `<b>`) și se randează cu `dangerouslySetInnerHTML`,
 * deci nu pot trece prin `t.rich()` — de aici înlocuirea manuală.
 *
 * Întoarce `null` când cifra cerută nu există: fie API-ul n-a răspuns, fie
 * site-ul are prea puține recenzii ca să merite afișate. Apelantul ASCUNDE
 * badge-ul în cazul ăsta. Alternativa — un fallback hardcodat — e exact ce am
 * scos: o cifră care nu corespunde cu nimic, afișată cu încredere.
 */
export function fillStats(
  template: string,
  site: Pick<SiteConfig, 'stats' | 'locale' | 'tickerPromoCode'>,
): string | null {
  const stats = site.stats;
  const needsCount = template.includes('{count}');
  const needsReviews = template.includes('{reviews}');
  const needsPromo = template.includes('{promo}');
  if (!needsCount && !needsReviews && !needsPromo) return template;

  // Codul promo apare doar dacă e chiar configurat pe site. Înainte era scris în
  // traduceri (`FRATE10`) și nu exista în baza de date — un cod pe care nimeni
  // nu-l putea folosi, afișat în opt limbi.
  const promo = site.tickerPromoCode?.trim();
  if (needsPromo && !promo) return null;

  if ((needsCount || needsReviews) && !stats) return null;
  if (needsCount && typeof stats?.songs !== 'number') return null;
  if (needsReviews && (stats?.reviews === null || typeof stats?.reviews !== 'number')) return null;

  return template
    .replace('{count}', () => formatCount(stats!.songs, site.locale))
    .replace('{reviews}', () => formatCount(stats!.reviews as number, site.locale))
    .replace('{promo}', () => promo ?? '');
}

/** Separator de mii după convenția locale-ului site-ului. */
export function formatCount(n: number, locale: string | undefined): string {
  try {
    return new Intl.NumberFormat(locale || 'ro').format(n);
  } catch {
    return String(n);
  }
}
