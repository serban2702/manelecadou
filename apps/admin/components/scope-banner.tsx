'use client';

import { useEffect, useState } from 'react';
import { Globe, Layers, AlertTriangle } from 'lucide-react';
import { ALL_SITES, getSelectedSiteId } from '@/lib/api/sites.api';
import { useSitesMap } from '@/lib/hooks/use-sites-map';
import { cn } from '@/lib/cn';

/**
 * Banner sticky de top care indică foarte clar scope-ul curent:
 *  - „Toate site-urile" → bandă portocalie cu warning + label „cross-tenant".
 *  - Site specific → bandă verde cu numele + dot colorat (din brand.primaryColor).
 *  - Niciun site (zero în DB) → bandă roșie cu prompt să creezi unul.
 *
 * E sticky în top — userul vede mereu pe ce scope lucrează, indiferent unde
 * dă scroll. Schimbă culoarea de fundal radical între „toate" vs single-site
 * ca să nu existe confuzie când rulează acțiuni distructive (ex. ștergere
 * promo cod care există pe mai multe site-uri).
 */
export function ScopeBanner() {
  const { byId, loaded } = useSitesMap();
  const [selectedId, setSelectedId] = useState<string>(ALL_SITES);

  useEffect(() => {
    setSelectedId(getSelectedSiteId());
    const onChange = () => setSelectedId(getSelectedSiteId());
    window.addEventListener('mc:site-changed', onChange);
    return () => window.removeEventListener('mc:site-changed', onChange);
  }, []);

  // Cât timp lista nu e încărcată, nu randa nimic (evită flash de „all sites" la mount).
  if (!loaded) {
    return <div className="h-1 bg-border/40" aria-hidden />;
  }

  const totalSites = byId.size;

  // 0 site-uri în DB — banner roșu de avertizare.
  if (totalSites === 0) {
    return (
      <div className="sticky top-0 z-30 bg-red-500/15 border-b border-red-500/40 backdrop-blur-sm">
        <div className="px-6 py-2.5 flex items-center gap-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <span className="text-red-300 font-medium">
            Niciun site configurat în DB.
          </span>
          <span className="text-red-200/70 hidden sm:inline">
            Mergi la <code className="px-1.5 py-0.5 rounded bg-red-500/20">/sites</code> și creează primul site.
          </span>
        </div>
      </div>
    );
  }

  // Mod „Toate site-urile" — doar pentru admini cu mai multe site-uri.
  // Cu un singur site, modul „all" practic nu există (selectorul auto-pin).
  if (selectedId === ALL_SITES && totalSites > 1) {
    return (
      <div className="sticky top-0 z-30 bg-amber-500/10 border-b-2 border-amber-500/50 backdrop-blur-sm">
        <div className="px-6 py-2.5 flex items-center gap-3 text-sm">
          <Layers className="h-4 w-4 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-amber-300 font-semibold">CROSS-TENANT</span>
            <span className="text-amber-200/80 mx-2">·</span>
            <span className="text-amber-200">
              Vizualizezi date AGREGATE de pe <strong>{totalSites} site-uri</strong>
            </span>
            <span className="text-amber-200/70 hidden md:inline ml-2">
              — schimbă selectorul din sidebar pentru un site specific
            </span>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-300/80 px-2 py-0.5 rounded border border-amber-500/40">
            <Globe className="h-3 w-3" />
            Toate site-urile
          </span>
        </div>
      </div>
    );
  }

  // Mod „Un site specific" sau „Single tenant" (un singur site existent).
  const site =
    selectedId !== ALL_SITES && byId.has(selectedId)
      ? byId.get(selectedId)!
      : Array.from(byId.values())[0]; // fallback: primul (când e single-tenant)

  if (!site) return null;

  const dot = site.primaryColor || '#10b981';

  return (
    <div className="sticky top-0 z-30 bg-emerald-500/5 border-b border-emerald-500/20 backdrop-blur-sm">
      <div className="px-6 py-2 flex items-center gap-3 text-sm">
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-emerald-500/20"
          style={{ background: dot }}
          aria-hidden
        />
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className="text-emerald-300 font-medium">SITE ACTIV</span>
          <span className="text-emerald-500/40">·</span>
          <span className="text-foreground font-semibold truncate">{site.name}</span>
          <code className="text-xs text-muted-foreground bg-card/60 px-1.5 py-0.5 rounded border border-border">
            {site.domain}
          </code>
        </div>
        {totalSites === 1 && (
          <span className="hidden md:inline text-[10px] uppercase tracking-wider text-muted-foreground">
            Single-tenant
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Variant inline pentru a tag-ui scope-ul unei pagini specifice (ex. în PageHeader).
 * E mai mic și se folosește când vrei să marchezi vizual că pagina X e cross-tenant
 * sau scoped la un site (ex. /chat și /inbox sunt strict per-site, /sites e cross).
 */
export function ScopeChip({
  scope,
  className,
}: {
  scope: 'cross-tenant' | 'per-site' | 'mixed';
  className?: string;
}) {
  const map = {
    'cross-tenant': {
      label: 'Cross-tenant',
      classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      icon: Layers,
    },
    'per-site': {
      label: 'Per-site',
      classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      icon: Globe,
    },
    'mixed': {
      label: 'Mixt',
      classes: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
      icon: Globe,
    },
  };
  const cfg = map[scope];
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border font-medium',
        cfg.classes,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}
