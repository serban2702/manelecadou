import { STYLES } from '@/lib/seed-data';
import type { SiteStyleEntry } from '@/lib/site-shared';

/** Stilurile pe interfața Cadou — 6, cele mai cerute în RO. */
const CADOU_STYLES: Array<{ id: string; nm?: string }> = [
  { id: 'iubire' },
  { id: 'romantica' },
  { id: 'clasic', nm: 'De pahar' },
  { id: 'opulenta' },
  { id: 'trompeta' },
  { id: 'oriental' },
];

export function resolveCadouStyles(siteStyles?: SiteStyleEntry[] | null): SiteStyleEntry[] {
  const seed = STYLES.map((s) => ({
    id: s.id, em: s.em, nm: s.nm, ds: s.ds, heat: s.heat, ic: s.ic,
  }));
  const byId = new Map<string, SiteStyleEntry>();
  for (const s of seed) byId.set(s.id, s);
  for (const s of siteStyles ?? []) byId.set(s.id, s);
  return CADOU_STYLES.map((pick) => {
    const src = byId.get(pick.id);
    if (!src) return null;
    return pick.nm ? { ...src, nm: pick.nm } : src;
  }).filter((s): s is SiteStyleEntry => !!s);
}
