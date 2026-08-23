'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCcw, Save, Search } from 'lucide-react';
import { useAsync } from '@/lib/hooks/use-async';
import { SettingsApi, type SettingCategoryView, type SettingView } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/cn';
import { SettingRow, type DraftEntry } from './setting-row';

type DraftMap = Record<string, DraftEntry>;

const DEFAULT_TAB = 'keys';
const SMTP_KEYS = new Set(['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SECURE']);
const MAILGUN_SITE_KEYS = new Set([
  'MAILGUN_DOMAIN',
  'MAILGUN_REGION',
  'MAILGUN_API_URL',
  'MAILGUN_FROM_EMAIL',
]);

type SearchHit = {
  key: string;
  label: string;
  categoryId: string;
  categoryTitle: string;
  group?: string;
};

function haystack(s: SettingView): string {
  return [s.key, s.label, s.description, s.helpWhat, s.helpWhere, s.group].filter(Boolean).join(' ').toLowerCase();
}

function searchSettings(cats: SettingCategoryView[], query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: (SearchHit & { score: number })[] = [];
  for (const cat of cats) {
    const titleHit = cat.title.toLowerCase().includes(q) || cat.id.toLowerCase().includes(q);
    for (const s of cat.settings) {
      const hay = haystack(s);
      if (!hay.includes(q) && !titleHit) continue;
      const keyHit = s.key.toLowerCase().includes(q);
      const labelHit = s.label.toLowerCase().includes(q) || (s.group ?? '').toLowerCase().includes(q);
      const score = keyHit ? 0 : labelHit ? 1 : hay.includes(q) ? 2 : 3;
      scored.push({
        key: s.key,
        label: s.label,
        categoryId: cat.id,
        categoryTitle: cat.title,
        group: s.group,
        score,
      });
    }
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, 8);
}

function effectiveValue(
  cats: SettingCategoryView[],
  draft: DraftMap,
  key: string,
): string {
  if (draft[key]) return draft[key].value;
  for (const cat of cats) {
    const s = cat.settings.find((x) => x.key === key);
    if (s) return s.value;
  }
  return '';
}

function visibleSettings(
  cat: SettingCategoryView,
  draft: DraftMap,
  cats: SettingCategoryView[],
  forceKeys: string[],
): SettingView[] {
  if (cat.id !== 'mail-system') return cat.settings;
  const provider = effectiveValue(cats, draft, 'MAIL_PROVIDER');
  const smtpDirty = cat.settings.some((s) => SMTP_KEYS.has(s.key) && draft[s.key]);
  const mgDirty = cat.settings.some((s) => MAILGUN_SITE_KEYS.has(s.key) && draft[s.key]);
  const showSmtp = provider === 'smtp' || smtpDirty || forceKeys.some((k) => SMTP_KEYS.has(k));
  const showMg = provider === 'mailgun' || mgDirty || forceKeys.some((k) => MAILGUN_SITE_KEYS.has(k));
  return cat.settings.filter((s) => {
    if (SMTP_KEYS.has(s.key)) return showSmtp;
    if (MAILGUN_SITE_KEYS.has(s.key)) return showMg;
    return true;
  });
}

function groupRows(settings: SettingView[]): { group?: string; settings: SettingView[] }[] {
  const out: { group?: string; settings: SettingView[] }[] = [];
  for (const s of settings) {
    const last = out[out.length - 1];
    if (last && last.group === s.group) last.settings.push(s);
    else out.push({ group: s.group, settings: [s] });
  }
  return out;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [draft, setDraft] = useState<DraftMap>({});
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [forceKeys, setForceKeys] = useState<string[]>([]);

  const { data: cats, loading: isLoading, refetch } = useAsync(() => SettingsApi.list(), []);

  useEffect(() => {
    if (!cats || cats.length === 0 || activeTab != null) return;
    setActiveTab(cats.some((c) => c.id === DEFAULT_TAB) ? DEFAULT_TAB : cats[0].id);
  }, [cats, activeTab]);

  const dirtyKeys = useMemo(() => Object.keys(draft), [draft]);
  const searchHits = useMemo(() => (cats ? searchSettings(cats, query) : []), [cats, query]);

  const save = useCallback(async () => {
    const keys = Object.keys(draft);
    if (!keys.length) return;
    setSaving(true);
    try {
      const updates = keys.map((k) => ({ key: k, value: draft[k].value, clear: draft[k].clear }));
      await SettingsApi.update(updates);
      toast({
        variant: 'success',
        title: 'Setări salvate',
        description: `${updates.length} câmp${updates.length === 1 ? '' : 'uri'} actualizate.`,
      });
      refetch();
      setDraft({});
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }, [draft, toast, refetch]);

  useEffect(() => {
    if (!highlightKey) return;
    const t = window.setTimeout(() => {
      document.querySelector(`[data-field="${highlightKey}"]`)?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      });
    }, 40);
    const clear = window.setTimeout(() => setHighlightKey(null), 2000);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(clear);
    };
  }, [highlightKey, activeTab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!saving) void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, saving]);

  function setKey(key: string, value: string) {
    setDraft((d) => ({ ...d, [key]: { value } }));
  }
  function clearKey(key: string) {
    setDraft((d) => ({ ...d, [key]: { value: '', clear: true } }));
  }
  function discard(key: string) {
    setDraft((d) => {
      const { [key]: _, ...rest } = d;
      return rest;
    });
  }
  function discardAll() {
    setDraft({});
  }

  function jumpTo(hit: SearchHit) {
    setActiveTab(hit.categoryId);
    setHighlightKey(hit.key);
    setForceKeys((ks) => (ks.includes(hit.key) ? ks : [...ks, hit.key]));
    setSearchOpen(false);
    setQuery('');
  }

  if (isLoading || !cats) {
    return (
      <div>
        <div className="mb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Setări</h1>
          <p className="mt-1 text-sm text-muted-foreground">Chei globale de platformă.</p>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const activeCat = cats.find((c) => c.id === activeTab) ?? cats.find((c) => c.id === DEFAULT_TAB) ?? cats[0];
  const shown = visibleSettings(activeCat, draft, cats, highlightKey ? [...forceKeys, highlightKey] : forceKeys);
  const grouped = groupRows(shown);

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-2.5 mb-4 border-b border-border bg-background/90 backdrop-blur">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold">Setări</h1>
            <p className="text-[11px] text-muted-foreground hidden sm:block">
              Chei globale de platformă — nu țin de un site.
            </p>
          </div>
          {dirtyKeys.length > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-amber-500">
                {dirtyKeys.length} {dirtyKeys.length === 1 ? 'modificare' : 'modificări'}
              </Badge>
              <Button variant="outline" size="sm" onClick={discardAll} disabled={saving}>
                <RotateCcw className="h-4 w-4" /> Renunță
              </Button>
              <Button size="sm" onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Se salvează…' : 'Salvează'}
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-4 items-start">
        <aside className="hidden md:flex w-56 shrink-0 flex-col gap-2 sticky top-16">
          <SettingsSearch
            query={query}
            searchOpen={searchOpen}
            searchHits={searchHits}
            onQuery={setQuery}
            onOpen={() => setSearchOpen(true)}
            onClose={() => setSearchOpen(false)}
            onJump={jumpTo}
          />
          {cats.map((c) => {
            const dirtyInCat = c.settings.some((s) => draft[s.key]);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveTab(c.id)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between gap-2',
                  activeCat.id === c.id
                    ? 'bg-primary/15 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-secondary',
                )}
              >
                <span>{c.title}</span>
                {dirtyInCat && <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />}
              </button>
            );
          })}
        </aside>

        <div className="flex-1 min-w-0 space-y-3">
          <div className="md:hidden space-y-2">
            <SettingsSearch
              query={query}
              searchOpen={searchOpen}
              searchHits={searchHits}
              onQuery={setQuery}
              onOpen={() => setSearchOpen(true)}
              onClose={() => setSearchOpen(false)}
              onJump={jumpTo}
            />
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {cats.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveTab(c.id)}
                  className={cn(
                    'shrink-0 rounded-full border px-2.5 py-1 text-xs',
                    activeCat.id === c.id
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border text-muted-foreground',
                  )}
                >
                  {c.title}
                  {c.settings.some((s) => draft[s.key]) && <span className="ml-1 text-amber-400">●</span>}
                </button>
              ))}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{activeCat.title}</CardTitle>
              {activeCat.description && <CardDescription>{activeCat.description}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-5">
              {grouped.map((g, i) => (
                <div key={g.group ?? `g-${i}`} className="space-y-5">
                  {g.group && (
                    <h3
                      className={cn(
                        'text-xs font-semibold uppercase tracking-wider text-muted-foreground',
                        i > 0 && 'pt-2 border-t border-border',
                      )}
                    >
                      {g.group}
                    </h3>
                  )}
                  {g.settings.map((s) => (
                    <SettingRow
                      key={s.key}
                      setting={s}
                      draftEntry={draft[s.key]}
                      showSecret={!!showSecret[s.key]}
                      highlighted={highlightKey === s.key}
                      onToggleSecret={() => setShowSecret((m) => ({ ...m, [s.key]: !m[s.key] }))}
                      onChange={(v) => setKey(s.key, v)}
                      onDiscard={() => discard(s.key)}
                      onClear={() => clearKey(s.key)}
                    />
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SettingsSearch({
  query,
  searchOpen,
  searchHits,
  onQuery,
  onOpen,
  onClose,
  onJump,
}: {
  query: string;
  searchOpen: boolean;
  searchHits: SearchHit[];
  onQuery: (v: string) => void;
  onOpen: () => void;
  onClose: () => void;
  onJump: (hit: SearchHit) => void;
}) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => {
          onQuery(e.target.value);
          onOpen();
        }}
        onFocus={onOpen}
        onBlur={() => window.setTimeout(onClose, 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && searchHits[0]) {
            e.preventDefault();
            onJump(searchHits[0]);
          }
          if (e.key === 'Escape') {
            onQuery('');
            onClose();
          }
        }}
        placeholder="Caută o setare…"
        className="h-8 pl-8 text-sm"
      />
      {searchOpen && query.trim() && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-border bg-popover shadow-lg overflow-hidden">
          {searchHits.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Nimic găsit</div>
          ) : (
            searchHits.map((hit) => (
              <button
                key={hit.key}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-secondary/60"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onJump(hit)}
              >
                <div className="font-medium">{hit.label}</div>
                <div className="text-[11px] text-muted-foreground">
                  {hit.categoryTitle}
                  {hit.group ? ` · ${hit.group}` : ''}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
