'use client';

import { useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { SitesApi, type SiteDto, ALL_SITES, getSelectedSiteId, setSelectedSiteId } from '@/lib/api/sites.api';
import { cn } from '@/lib/cn';

/**
 * Selector global de site, montat în sidebar admin. Ce alege se salvează în
 * localStorage `mc_admin_site` și se trimite la fiecare request ca header
 * `x-site-id`. Valoarea "all" → cross-site (folosit pentru rapoarte agregate).
 *
 * Schimbarea declanșează un evenimet `mc:site-changed` pe care orice pagină îl
 * poate asculta dacă vrea să refetch-uiască datele instant.
 */
export function SiteSelector() {
  const [sites, setSites] = useState<SiteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>(ALL_SITES);

  useEffect(() => {
    setSelected(getSelectedSiteId());
    SitesApi.list()
      .then((all) => {
        setSites(all);
      })
      .catch(() => setSites([]))
      .finally(() => setLoading(false));
  }, []);

  function handleChange(value: string) {
    setSelected(value);
    setSelectedSiteId(value);
    // Pentru cele mai multe pagini admin care folosesc `useAsync`, schimbarea
    // siteId-ului = schimbare de scope → cel mai sigur e refresh hard ca să
    // ștergem orice cache local. Acceptabil pentru un panou intern.
    window.location.reload();
  }

  if (loading) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
        Se încarcă site-urile...
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
        Niciun site configurat
      </div>
    );
  }

  // Selectorul e MEREU dropdown cu „Toate" + fiecare site, indiferent de câte sunt.
  // Stilizare clar diferențiată în funcție de scope-ul curent.
  const isAll = selected === ALL_SITES;
  return (
    <div
      className={cn(
        'px-3 py-3 border-b transition-colors',
        isAll
          ? 'bg-amber-500/10 border-amber-500/40'
          : 'bg-emerald-500/5 border-emerald-500/20',
      )}
    >
      <label
        className={cn(
          'flex items-center gap-1.5 text-[10px] uppercase tracking-wider mb-1.5 font-semibold',
          isAll ? 'text-amber-400' : 'text-emerald-400/80',
        )}
      >
        <Globe className="h-3 w-3" />
        {isAll ? 'Cross-tenant — toate' : 'Site activ'}
      </label>
      <select
        value={selected}
        onChange={(e) => handleChange(e.target.value)}
        className={cn(
          'w-full bg-background border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 transition-colors',
          isAll
            ? 'border-amber-500/40 focus:ring-amber-500/40 text-amber-200'
            : 'border-emerald-500/30 focus:ring-emerald-500/40',
        )}
      >
        <option value={ALL_SITES}>🌍 Toate site-urile (cross-tenant)</option>
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.active ? '🟢' : '⚫'} {s.name} ({s.domain})
          </option>
        ))}
      </select>
      <div className={cn('text-[10px] mt-1.5', isAll ? 'text-amber-300/70' : 'text-muted-foreground')}>
        {isAll
          ? `${sites.length} site-uri agregate · chat/inbox dezactivat`
          : 'Toate paginile filtrează acest site'}
      </div>
    </div>
  );
}
