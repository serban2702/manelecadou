/**
 * Pachetele (Standard / Plus / Premium) — helperi PURI peste configul de site.
 *
 * Nu mai există niciun catalog hardcodat aici. Sursa unică de adevăr e
 * `/api/public/site` → `experienceConfig.items[<interfață>].packages[<tier>]`,
 * unde API-ul a rezolvat deja: default din cod ← preț per-site ← default pe
 * interfață ← override din admin. Adică exact ce editează proprietarul în admin
 * (nume, preț, „ce conține", durată, refaceri, limită poze la colaj, etichetă
 * de livrare, activat/dezactivat) și exact ce taxează Stripe.
 *
 * Pentru client components folosește hook-urile din `@/experiences/use-packages`
 * (rezolvă singure interfața curentă). Funcțiile de aici sunt pentru server
 * components, care au deja configul de site în mână.
 */
import type { PackageTier, SiteConfig, SitePackage } from './site-shared';

export type { PackageTier, SitePackage } from './site-shared';

/** Ordinea stabilă în care se afișează pachetele peste tot în UI. */
export const PACKAGE_TIERS: readonly PackageTier[] = ['basic', 'plus', 'premium'] as const;

export const DEFAULT_PACKAGE_TIER: PackageTier = 'basic';

/**
 * Pachetul evidențiat ca „RECOMANDAT". E o decizie de UI (unde cade ochiul în
 * grilă), nu un livrabil — de-aia nu vine din admin. Dacă tier-ul e dezactivat
 * pe interfața curentă, nu se evidențiază nimic.
 */
export const RECOMMENDED_PACKAGE_TIER: PackageTier = 'plus';

/** Toate pachetele rezolvate pentru o interfață, în ordine, INCLUSIV cele oprite. */
export function allSitePackages(
  site: Pick<SiteConfig, 'experienceConfig'>,
  experienceSlug: string,
): SitePackage[] {
  const packages = site.experienceConfig?.items?.[experienceSlug]?.packages;
  if (!packages) return [];
  const out: SitePackage[] = [];
  for (const tier of PACKAGE_TIERS) {
    const p = packages[tier];
    // `tier` poate lipsi dintr-un JSON vechi — îl completăm din cheie, ca
    // lookup-urile după `p.tier` să nu cadă în gol.
    if (p) out.push(p.tier ? p : { ...p, tier });
  }
  return out;
}

/** Pachetele de VITRINĂ: doar cele active, în ordinea basic → plus → premium. */
export function sitePackages(
  site: Pick<SiteConfig, 'experienceConfig'>,
  experienceSlug: string,
): SitePackage[] {
  return allSitePackages(site, experienceSlug).filter((p) => p.enabled !== false);
}

/**
 * Un pachet anume. Întoarce și pachetele OPRITE — o comandă veche plătită pe un
 * pachet scos între timp din vitrină trebuie să-și arate în continuare numele.
 */
export function sitePackage(
  site: Pick<SiteConfig, 'experienceConfig'>,
  experienceSlug: string,
  tier: PackageTier | string | null | undefined,
): SitePackage | null {
  if (!tier) return null;
  return allSitePackages(site, experienceSlug).find((p) => p.tier === tier) ?? null;
}

/**
 * Prețul „de la X" — cel mai mic preț dintre pachetele ACTIVE.
 * `null` = configul n-a ajuns încă / site vechi fără pachete: afișează un
 * schelet, nu o cifră din cod (un preț greșit e mai rău decât niciun preț).
 */
export function fromPriceCents(
  site: Pick<SiteConfig, 'experienceConfig'>,
  experienceSlug: string,
): number | null {
  const prices = sitePackages(site, experienceSlug)
    .map((p) => p.priceCents)
    .filter((c) => typeof c === 'number' && c > 0);
  return prices.length ? Math.min(...prices) : null;
}

/** Pachetul cel mai ieftin dintre cele active (cel folosit ca ancoră „de la"). */
export function cheapestSitePackage(
  site: Pick<SiteConfig, 'experienceConfig'>,
  experienceSlug: string,
): SitePackage | null {
  return sitePackages(site, experienceSlug).reduce<SitePackage | null>(
    (best, p) => (p.priceCents > 0 && (!best || p.priceCents < best.priceCents) ? p : best),
    null,
  );
}

/** Procentul de reducere afișabil pentru un pachet. 0 = fără preț tăiat. */
export function discountPercent(pkg: Pick<SitePackage, 'priceCents' | 'compareAtCents'>): number {
  const compare = pkg.compareAtCents;
  if (!compare || compare <= pkg.priceCents) return 0;
  return Math.round((1 - pkg.priceCents / compare) * 100);
}

export function isPackageTier(v: unknown): v is PackageTier {
  return v === 'basic' || v === 'plus' || v === 'premium';
}
