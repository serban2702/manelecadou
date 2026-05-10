'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAsync } from "@/lib/hooks/use-async";
import { AlertTriangle, Database, Eye, EyeOff, FileLock2, Loader2, RotateCcw, Save, Server, Trash2 } from 'lucide-react';
import { SettingsApi, type SettingCategoryView, type SettingView } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/cn';

type DraftMap = Record<string, { value: string; clear?: boolean }>;

export default function SettingsPage() {
  const { toast } = useToast();
  const [draft, setDraft] = useState<DraftMap>({});
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const { data: cats, loading: isLoading, refetch } = useAsync(() => SettingsApi.list(), []);

  useEffect(() => {
    if (cats && cats.length > 0 && activeTab == null) setActiveTab(cats[0].id);
  }, [cats, activeTab]);

  const dirtyKeys = useMemo(() => Object.keys(draft), [draft]);

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

  async function save() {
    if (!dirtyKeys.length) return;
    setSaving(true);
    try {
      const updates = dirtyKeys.map((k) => ({ key: k, value: draft[k].value, clear: draft[k].clear }));
      await SettingsApi.update(updates);
      toast({ variant: 'success', title: 'Setări salvate', description: `${updates.length} câmp${updates.length === 1 ? '' : 'uri'} actualizate.` });
      refetch();
      setDraft({});
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !cats) {
    return (
      <div>
        <PageHeader title="Setări" description="Configurează aplicația din UI." />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      </div>
    );
  }

  const activeCat = cats.find((c) => c.id === activeTab) ?? cats[0];

  return (
    <div>
      <PageHeader
        title="Setări"
        description="Toate setările sunt salvate în baza de date (criptate dacă sunt secrete) și au prioritate față de variabilele din .env."
        actions={
          dirtyKeys.length > 0 ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{dirtyKeys.length} modificări</Badge>
              <Button variant="outline" onClick={discardAll}>
                <RotateCcw className="h-4 w-4" /> Renunță
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvează
              </Button>
            </div>
          ) : null
        }
      />

      <div className="flex gap-4">
        <aside className="w-56 shrink-0 space-y-1">
          {cats.map((c) => {
            const dirtyInCat = c.settings.some((s) => draft[s.key]);
            return (
              <button
                key={c.id}
                onClick={() => setActiveTab(c.id)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between gap-2',
                  activeCat.id === c.id ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-secondary',
                )}
              >
                <span>{c.title}</span>
                {dirtyInCat && <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />}
              </button>
            );
          })}
        </aside>

        <div className="flex-1 min-w-0">
          <Card>
            <CardHeader>
              <CardTitle>{activeCat.title}</CardTitle>
              {activeCat.description && <CardDescription>{activeCat.description}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-5">
              {activeCat.settings.map((s) => (
                <SettingRow
                  key={s.key}
                  setting={s}
                  draftEntry={draft[s.key]}
                  showSecret={!!showSecret[s.key]}
                  onToggleSecret={() => setShowSecret((m) => ({ ...m, [s.key]: !m[s.key] }))}
                  onChange={(v) => setKey(s.key, v)}
                  onDiscard={() => discard(s.key)}
                  onClear={() => clearKey(s.key)}
                />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SettingRow({
  setting, draftEntry, showSecret, onToggleSecret, onChange, onDiscard, onClear,
}: {
  setting: SettingView;
  draftEntry: { value: string; clear?: boolean } | undefined;
  showSecret: boolean;
  onToggleSecret: () => void;
  onChange: (v: string) => void;
  onDiscard: () => void;
  onClear: () => void;
}) {
  const isDirty = !!draftEntry;
  const currentValue = draftEntry ? draftEntry.value : setting.value;
  const isSecret = setting.kind === 'secret';

  // For secret fields, the masked value comes from server; show empty in edit mode unless user typed something
  const renderValue = isDirty ? currentValue : (isSecret ? '' : currentValue);

  return (
    <div className={cn('space-y-1.5 pb-4 border-b border-border last:border-b-0 last:pb-0')}>
      <div className="flex items-center gap-2">
        <Label className="text-sm font-medium">{setting.label}</Label>
        <code className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{setting.key}</code>
        <SourceBadge source={setting.source} hasDbValue={setting.hasDbValue} />
        {setting.encrypted && (
          <Badge variant="outline" className="gap-1 text-[10px]"><FileLock2 className="h-3 w-3" /> criptat</Badge>
        )}
        {setting.requiresRestart && (
          <Badge variant="outline" className="gap-1 text-[10px] text-amber-500 border-amber-500/40">
            <AlertTriangle className="h-3 w-3" /> necesită restart
          </Badge>
        )}
        {isDirty && <Badge variant="secondary" className="text-[10px] text-amber-500">modificat</Badge>}
      </div>
      {setting.description && <p className="text-xs text-muted-foreground">{setting.description}</p>}

      <div className="flex items-stretch gap-2">
        <div className="flex-1">
          {setting.kind === 'bool' ? (
            <div className="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-background/40">
              <Switch
                checked={(isDirty ? currentValue : setting.value).toString() === 'true'}
                onCheckedChange={(v) => onChange(v ? 'true' : 'false')}
              />
              <span className="text-sm text-muted-foreground">{(isDirty ? currentValue : setting.value).toString() === 'true' ? 'Activat' : 'Dezactivat'}</span>
            </div>
          ) : setting.kind === 'select' ? (
            <Select value={isDirty ? currentValue : setting.value} onValueChange={onChange}>
              <SelectTrigger><SelectValue placeholder="Selectează…" /></SelectTrigger>
              <SelectContent>
                {(setting.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : setting.kind === 'longtext' ? (
            <Textarea value={renderValue} onChange={(e) => onChange(e.target.value)} placeholder={isSecret && setting.hasDbValue ? '••••••• (lasă gol = neschimbat)' : setting.placeholder} className="min-h-[80px] font-mono text-xs" />
          ) : (
            <Input
              type={setting.kind === 'number' ? 'number' : isSecret && !showSecret ? 'password' : 'text'}
              value={renderValue}
              onChange={(e) => onChange(e.target.value)}
              placeholder={isSecret && setting.hasDbValue && !isDirty ? '••••••• (lasă gol = neschimbat)' : setting.placeholder}
              className={isSecret ? 'font-mono' : ''}
            />
          )}
        </div>

        {isSecret && (
          <Button variant="ghost" size="icon" type="button" onClick={onToggleSecret} title={showSecret ? 'Ascunde' : 'Arată'}>
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        )}

        {isDirty ? (
          <Button variant="ghost" size="icon" type="button" onClick={onDiscard} title="Renunță la modificare">
            <RotateCcw className="h-4 w-4" />
          </Button>
        ) : (
          setting.hasDbValue && (
            <Button variant="ghost" size="icon" type="button" onClick={onClear} title="Șterge override-ul DB (revino la .env)">
              <Trash2 className="h-4 w-4" />
            </Button>
          )
        )}
      </div>
    </div>
  );
}

function SourceBadge({ source, hasDbValue }: { source: 'db' | 'env' | 'unset'; hasDbValue: boolean }) {
  if (hasDbValue || source === 'db') return <Badge variant="secondary" className="gap-1 text-[10px] text-primary"><Database className="h-3 w-3" /> DB</Badge>;
  if (source === 'env') return <Badge variant="outline" className="gap-1 text-[10px]"><Server className="h-3 w-3" /> .env</Badge>;
  return <Badge variant="outline" className="text-[10px] text-muted-foreground">nesetat</Badge>;
}
