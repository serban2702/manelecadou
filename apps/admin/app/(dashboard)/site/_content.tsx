'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Globe, Loader2, Search, X } from 'lucide-react';
import {
  SitesApi,
  type SamplesListDto,
  type SiteDto,
  ALL_SITES,
  getSelectedSiteId,
} from '@/lib/api/sites.api';
import { SiteDemosApi, type SiteDemo } from '@/lib/api/site-demos.api';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/cn';
import {
  useSpaNavigate,
  useSpaNavGuard,
  useSpaPathname,
} from '@/lib/spa-router';
import { describeDirty, screenForDirtyPath } from './dirty';
import { DirtyChangesBadge } from './dirty-popover';
import { toUpdatePayload } from './payload';
import {
  SITE_NAV,
  STUDIO_STORAGE_KEY,
  highlightStudioField,
  isStudioPath,
  matchStudioPath,
  searchFieldOf,
  searchStudio,
  setStudioFocus,
  type StudioNavId,
} from './studio-nav';
import { OverviewScreen } from './screens/overview-screen';
import { IdentityScreen } from './screens/identity-screen';
import { PricesScreen } from './screens/prices-screen';
import { AppearanceScreen } from './screens/appearance-screen';
import { CatalogScreen } from './screens/catalog-screen';
import { InterfacesScreen } from './screens/interfaces-screen';
import { GenerationScreen } from './screens/generation-screen';
import { PlaygroundScreen } from './screens/playground-screen';
import { OperationsScreen } from './screens/operations-screen';
import { TopScreen } from './screens/top-screen';

export default function SiteConfigPage() {
  const { toast } = useToast();
  const navigate = useSpaNavigate();
  const pathname = useSpaPathname();
  const [siteId, setSiteId] = useState<string>('');
  const [site, setSite] = useState<SiteDto | null>(null);
  const [form, setForm] = useState<SiteDto | null>(null);
  const [samples, setSamples] = useState<SamplesListDto | null>(null);
  const [siteDemos, setSiteDemos] = useState<SiteDemo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seedNonce, setSeedNonce] = useState(0);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const match = matchStudioPath(pathname);
  const dirty = useMemo(
    () => (site && form ? describeDirty(site, form) : { count: 0, paths: [] as string[], changes: [] }),
    [site, form],
  );
  const dirtyCountRef = useRef(0);
  dirtyCountRef.current = dirty.count;
  const dirtyScreens = useMemo(() => new Set(dirty.paths.map(screenForDirtyPath)), [dirty.paths]);

  useEffect(() => {
    setSiteId(getSelectedSiteId());
    const onChange = () => setSiteId(getSelectedSiteId());
    window.addEventListener('mc:site-changed', onChange);
    return () => window.removeEventListener('mc:site-changed', onChange);
  }, []);

  useEffect(() => {
    if (match.unknown) {
      navigate('/site/overview', { replace: true });
      return;
    }
    if (pathname.replace(/\/+$/, '') === '/site/catalog') {
      navigate('/site/catalog/styles', { replace: true });
    }
  }, [match.unknown, pathname, navigate]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!match.unknown) window.localStorage.setItem(STUDIO_STORAGE_KEY, match.href);
  }, [match.href, match.unknown]);

  const refresh = useCallback(async () => {
    if (!siteId || siteId === ALL_SITES) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [s, sm, dm] = await Promise.all([
        SitesApi.get(siteId),
        SitesApi.listSamples(siteId).catch(() => null),
        SiteDemosApi.list(siteId)
          .then((r) => r.items)
          .catch(() => [] as SiteDemo[]),
      ]);
      setSite(s);
      setForm(s);
      setSamples(sm);
      setSiteDemos(dm);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare', description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }, [siteId, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!samples) return;
    const anyGenerating =
      samples.styles.some((s) => s.generating) || samples.voices.some((s) => s.generating);
    if (!anyGenerating) return;
    const t = setInterval(async () => {
      try {
        const sm = await SitesApi.listSamples(siteId);
        setSamples(sm);
      } catch {
        /* ignore */
      }
    }, 8000);
    return () => clearInterval(t);
  }, [samples, siteId]);

  const save = useCallback(async () => {
    if (!form || !siteId) return;
    setSaving(true);
    try {
      const updated = await SitesApi.update(siteId, toUpdatePayload(form, site));
      setSite(updated);
      setForm(updated);
      toast({ variant: 'success', title: 'Site actualizat' });
      if (match.id === 'catalog') {
        // Save-ul a reușit; doar reîncărcarea mostrelor poate pica. Nu transformăm
        // asta în eroare de salvare, dar nici nu o înghițim — altfel userul rămâne
        // cu mostre stale pe ecran fără niciun semnal.
        try {
          setSamples(await SitesApi.listSamples(siteId));
        } catch {
          toast({
            variant: 'warning',
            title: 'Mostrele n-au putut fi reîncărcate',
            description: 'Salvarea a mers. Reîncarcă pagina ca să vezi mostrele la zi.',
          });
        }
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare salvare', description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }, [form, site, siteId, toast, match.id]);

  function discard() {
    if (!site) return;
    setForm(site);
    setSeedNonce((n) => n + 1);
  }

  useSpaNavGuard(async (to) => {
    if (dirtyCountRef.current === 0) return true;
    if (isStudioPath(to)) return true;
    return confirmDialog({
      title: 'Ai modificări nesalvate',
      description: 'Dacă pleci acum, pierzi schimbările din acest site.',
      confirmText: 'Părăsește',
      cancelText: 'Stai aici',
      variant: 'destructive',
    });
  });

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyCountRef.current === 0) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirtyCountRef.current > 0 && !saving) void save();
      }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setQuery('');
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, saving]);

  // Intrările de pe un design (pachete, UTM, catalog interfață…) se rezolvă pe
  // interfața deschisă acum; dacă suntem în listă, pe cea implicită a site-ului.
  const searchInterfaceSlug = match.interfaceSlug ?? form?.experienceConfig?.defaultSlug ?? 'classic';
  const searchHits = useMemo(
    () => searchStudio(query, { interfaceSlug: searchInterfaceSlug }),
    [query, searchInterfaceSlug],
  );
  const navItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SITE_NAV;
    const hitIds = new Set(searchHits.map((h) => h.group));
    const filtered = SITE_NAV.filter(
      (n) => n.label.toLowerCase().includes(q) || n.help.toLowerCase().includes(q) || hitIds.has(n.id),
    );
    return filtered.length ? filtered : SITE_NAV;
  }, [query, searchHits]);

  function goStudio(href: string, fieldId?: string) {
    window.localStorage.setItem(STUDIO_STORAGE_KEY, href);
    if (fieldId?.startsWith('catalog.style')) {
      setStudioFocus({ fieldId, catalogKind: 'styles' });
    } else if (fieldId?.startsWith('catalog.occasion')) {
      setStudioFocus({ fieldId, catalogKind: 'occasions' });
    } else if (fieldId?.startsWith('catalog.voice')) {
      setStudioFocus({ fieldId, catalogKind: 'voices' });
    }
    navigate(href);
    setSearchOpen(false);
    if (fieldId) highlightStudioField(fieldId);
  }

  async function savePartial(patch: Partial<SiteDto>): Promise<boolean> {
    if (!form || !siteId) return false;
    try {
      if (dirty.count > 0) {
        const ok = await confirmDialog({
          title: 'Ai modificări nesalvate',
          description:
            'Ca să adaugi sau să ștergi din catalog, salvăm întâi tot site-ul — inclusiv modificările din celelalte ecrane.',
          confirmText: 'Salvează tot, apoi continuă',
          cancelText: 'Anulează',
        });
        if (!ok) return false;
        const updated = await SitesApi.update(siteId, toUpdatePayload({ ...form, ...patch }, site));
        setSite(updated);
        setForm(updated);
        toast({ variant: 'success', title: 'Salvat' });
        return true;
      }
      await SitesApi.update(siteId, patch);
      const s = await SitesApi.get(siteId);
      setSite(s);
      setForm(s);
      return true;
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare salvare', description: (err as Error).message });
      return false;
    }
  }

  if (!siteId || siteId === ALL_SITES) {
    return (
      <div>
        <PageHeader title="Acest site" description="Selectează un site din partea stângă ca să-l configurezi." />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Globe className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <div className="font-medium">Niciun site selectat</div>
            <div className="text-sm">Folosește dropdown-ul „Site activ" din sidebar.</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || !site || !form) {
    return (
      <div>
        <PageHeader title="Acest site" description="Se încarcă..." />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const engineLabel = form.musicEngine === 'google' ? 'Google Lyria' : 'Suno';
  const statusLabel = form.hiddenMode ? 'Ascuns' : form.maintenanceMode ? 'Mentenanță' : form.active ? 'Activ' : 'Inactiv';

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-2.5 mb-4 border-b border-border bg-background/90 backdrop-blur">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-sm font-semibold truncate">{form.name}</h1>
              <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
                {form.domain} · {engineLabel} · {statusLabel}
              </span>
            </div>
            <div className="relative mt-1.5 max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchHits[0]) {
                    e.preventDefault();
                    goStudio(searchHits[0].href, searchFieldOf(searchHits[0]));
                  }
                  if (e.key === 'Escape') {
                    setQuery('');
                    setSearchOpen(false);
                  }
                }}
                placeholder="Caută o setare…"
                className="h-8 pl-8 text-sm"
              />
              {searchOpen && query.trim() && searchHits.length > 0 && (
                <div className="absolute z-30 mt-1 w-full rounded-md border border-border bg-popover shadow-lg overflow-hidden">
                  {searchHits.map((hit) => (
                    <button
                      key={hit.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-secondary/60"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => goStudio(hit.href, searchFieldOf(hit))}
                    >
                      <div className="font-medium">{hit.label}</div>
                      <div className="text-[11px] text-muted-foreground">{SITE_NAV.find((n) => n.id === hit.group)?.label}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/sites')}>
              <ArrowLeft className="h-4 w-4" />
              Listă
            </Button>
            {dirty.count > 0 && (
              <>
                <DirtyChangesBadge count={dirty.count} changes={dirty.changes} onGo={(href) => goStudio(href)} />
                <Button variant="outline" size="sm" onClick={discard} disabled={saving}>
                  <X className="h-4 w-4" />
                  Renunță
                </Button>
              </>
            )}
            <Button onClick={() => void save()} disabled={saving || dirty.count === 0} size="sm">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? 'Se salvează…' : 'Salvează'}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex gap-6 items-start">
        <nav className="hidden md:block w-[208px] shrink-0 sticky top-16">
          <StudioNavList
            items={navItems}
            activeId={match.id}
            dirtyScreens={dirtyScreens}
            onGo={goStudio}
          />
        </nav>

        <div className="min-w-0 flex-1">
          <div className="md:hidden mb-3">
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {navItems.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => goStudio(n.href)}
                  className={cn(
                    'shrink-0 rounded-full border px-2.5 py-1 text-xs',
                    match.id === n.id
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border text-muted-foreground',
                  )}
                >
                  {n.label}
                  {dirtyScreens.has(n.id) && <span className="ml-1 text-amber-400">●</span>}
                </button>
              ))}
            </div>
          </div>

          {match.id === 'overview' && <OverviewScreen form={form} dirtyCount={dirty.count} />}
          {match.id === 'identity' && <IdentityScreen form={form} setForm={setForm} />}
          {match.id === 'prices' && <PricesScreen form={form} setForm={setForm} />}
          {match.id === 'appearance' && <AppearanceScreen siteId={siteId} form={form} setForm={setForm} />}
          {match.id === 'generation' && <GenerationScreen form={form} setForm={setForm} />}
          {match.id === 'playground' && <PlaygroundScreen form={form} />}
          {match.id === 'operations' && <OperationsScreen siteId={siteId} form={form} setForm={setForm} />}
          {match.id === 'interfaces' && (
            <InterfacesScreen form={form} setForm={setForm} demos={siteDemos} />
          )}
          {match.id === 'top' && (
            <TopScreen form={form} setForm={setForm} samples={samples} demos={siteDemos} />
          )}
          {match.id === 'catalog' && (
            <CatalogScreen
              siteId={siteId}
              form={form}
              setForm={setForm}
              samples={samples}
              onSamplesChange={setSamples}
              onRefresh={refresh}
              onSavePartial={savePartial}
              seedNonce={seedNonce}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StudioNavList({
  items,
  activeId,
  dirtyScreens,
  onGo,
}: {
  items: typeof SITE_NAV;
  activeId: StudioNavId;
  dirtyScreens: Set<StudioNavId>;
  onGo: (href: string) => void;
}) {
  return (
    <ul className="grid gap-0.5">
      {items.map((n) => {
        const Icon = n.icon;
        const active = n.id === activeId;
        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => onGo(n.href)}
              className={cn(
                'w-full flex items-start gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                active
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', active && 'scale-110')} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate">{n.label}</span>
                  {dirtyScreens.has(n.id) && (
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                  )}
                </span>
                <span className={cn('block text-[10px] font-normal truncate', active ? 'text-primary/70' : 'text-muted-foreground/80')}>
                  {n.help}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
