import { OCC } from '@/lib/seed-data';
import type { SiteOccasionEntry } from '@/lib/site-shared';

/** Ocaziile pe interfața Cadou — cele de cadou. Restul rămân pe UI-ul clasic. */
export const CADOU_OCCASION_IDS = ['zi', 'nunta', 'botez', 'dragoste', 'cuplu', 'nas', 'sef', 'altul'] as const;

export function resolveCadouOccasions(siteOccasions?: SiteOccasionEntry[] | null): SiteOccasionEntry[] {
  const seed = OCC.map((o) => ({ id: o.id, em: o.em, nm: o.nm }));
  const byId = new Map<string, SiteOccasionEntry>();
  for (const o of seed) byId.set(o.id, o);
  for (const o of siteOccasions ?? []) byId.set(o.id, { id: o.id, em: o.em, nm: o.nm });
  return CADOU_OCCASION_IDS.map((id) => byId.get(id)).filter((o): o is SiteOccasionEntry => !!o);
}
