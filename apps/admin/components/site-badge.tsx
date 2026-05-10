'use client';

import { useSitesMap, type SiteMapEntry } from '@/lib/hooks/use-sites-map';

/**
 * Badge mic care afișează site-ul căruia îi aparține un rând. Folosit în tabele
 * admin când selectorul e pe „Toate site-urile" (cross-tenant).
 *
 * Render:
 *  - dot colorat (din site.brand.primaryColor)
 *  - slug ca text (compact)
 *  - tooltip = numele complet
 */
export function SiteBadge({ siteId }: { siteId: string | null | undefined }) {
  const { byId } = useSitesMap();
  if (!siteId) {
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }
  const site = byId.get(siteId);
  return (
    <span
      title={site?.name ?? siteId}
      className="inline-flex items-center gap-1.5 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium"
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: site?.primaryColor ?? '#888' }}
      />
      {site?.slug ?? siteId.slice(0, 6)}
    </span>
  );
}

/** Helper standalone pentru când ai deja entry-ul. */
export function siteLabel(entry: SiteMapEntry | undefined, fallback: string): string {
  return entry?.slug ?? entry?.name ?? fallback;
}
