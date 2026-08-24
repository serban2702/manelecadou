'use client';

import { useMemo } from 'react';
import { useSite } from '@/lib/site-context';
import { useExperience } from '@/lib/experience-context';
import {
  RECOMMENDED_PACKAGE_TIER,
  allSitePackages,
  fromPriceCents,
  sitePackages,
} from '@/lib/packages';
import type { PackageTier, SitePackage } from '@/lib/site-shared';

export interface UsePackagesResult {
  /** Interfața pentru care s-au rezolvat pachetele. */
  slug: string;
  /**
   * `false` doar dacă site-ul n-a livrat deloc pachete (config vechi sau API
   * picat la SSR). Consumatorii randează schelet, NU cifre din cod.
   */
  loaded: boolean;
  /** Pachetele de vitrină: doar cele active, în ordinea basic → plus → premium. */
  items: SitePackage[];
  /** Lookup după tier, INCLUSIV pachetele oprite (comenzi vechi). */
  byTier: Partial<Record<PackageTier, SitePackage>>;
  /** Cel mai mic preț dintre pachetele active. `null` = încă nu știm. */
  fromCents: number | null;
  /** Tier-ul evidențiat în grilă, dacă e activ. */
  recommendedTier: PackageTier | null;
}

/**
 * Pachetele rezolvate pentru interfața CURENTĂ, exact cum le-a editat
 * proprietarul în admin. Datele sunt deja hidratate din SSR prin `SiteProvider`
 * (`/api/public/site`) — hook-ul e sincron, fără fetch și fără stare de
 * încărcare în cazul normal.
 */
export function usePackages(): UsePackagesResult {
  const site = useSite();
  const exp = useExperience();
  const config = site.experienceConfig;
  const slug = exp.slug;

  return useMemo(() => {
    const all = allSitePackages({ experienceConfig: config }, slug);
    const items = sitePackages({ experienceConfig: config }, slug);
    const byTier: Partial<Record<PackageTier, SitePackage>> = {};
    for (const p of all) byTier[p.tier] = p;
    return {
      slug,
      loaded: all.length > 0,
      items,
      byTier,
      fromCents: fromPriceCents({ experienceConfig: config }, slug),
      recommendedTier: items.some((p) => p.tier === RECOMMENDED_PACKAGE_TIER)
        ? RECOMMENDED_PACKAGE_TIER
        : null,
    };
  }, [config, slug]);
}

/**
 * Un singur pachet. Întoarce și pachetele oprite din vitrină — o comandă deja
 * plătită trebuie să-și arate numele chiar dacă pachetul a fost scos.
 */
export function usePackage(tier: PackageTier | string | null | undefined): SitePackage | null {
  const { byTier } = usePackages();
  if (!tier) return null;
  return byTier[tier as PackageTier] ?? null;
}

/** Prețul „de la X" pe interfața curentă. `null` = afișează schelet. */
export function useFromPriceCents(): number | null {
  return usePackages().fromCents;
}
