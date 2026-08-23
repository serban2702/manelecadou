'use client';

import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import type { SamplesListDto, SiteDto, SiteTopTemplateItem } from '@/lib/api/sites.api';
import type { SiteDemo } from '@/lib/api/site-demos.api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
import { Field, StudioSection, SubSection } from '../studio-primitives';

function resolveAudioSrc(url: string): string {
  if (!url || url.startsWith('http')) return url;
  const base = process.env.NEXT_PUBLIC_API_URL ?? '';
  return `${base}${url}`;
}

export function TopScreen({
  form,
  setForm,
  samples,
  demos,
}: {
  form: SiteDto;
  setForm: (f: SiteDto) => void;
  samples: SamplesListDto | null;
  demos: SiteDemo[];
}) {
  const items = form.topTemplate ?? [];

  const styleLabel = (key: string) => form.styles?.find((s) => s.id === key)?.nm ?? key;
  const voiceLabel = (key: string) => form.voices?.find((v) => v.id === key)?.nm ?? key;

  // Pool-ul disponibil = toate track-urile audio din aplicație:
  //  - mostre de stil (🎵) + mostre de voce (🎤) din suno samples
  //  - melodiile din „Ascultă exemple" (🎶) din site_demos
  type DemoOption = { kind: 'style' | 'voice' | 'demo'; key: string; label: string; audioUrl: string };
  const demoOptions: DemoOption[] = [
    ...(samples?.styles ?? [])
      .filter((s) => s.entry?.audioUrl)
      .map((s) => ({
        kind: 'style' as const,
        key: s.key,
        label: `🎵 Stil: ${styleLabel(s.key)}`,
        audioUrl: resolveAudioSrc(s.entry!.audioUrl),
      })),
    ...(samples?.voices ?? [])
      .filter((v) => v.entry?.audioUrl)
      .map((v) => ({
        kind: 'voice' as const,
        key: v.key,
        label: `🎤 Voce: ${voiceLabel(v.key)}`,
        audioUrl: resolveAudioSrc(v.entry!.audioUrl),
      })),
    ...demos
      .filter((d) => d.audioUrl)
      .map((d) => ({
        kind: 'demo' as const,
        key: d.id,
        label: `🎶 Exemplu: ${d.title}${d.toName ? ` (pt ${d.toName})` : ''}`,
        audioUrl: resolveAudioSrc(d.audioUrl),
      })),
  ];
  const audioByKey = new Map(demoOptions.map((o) => [`${o.kind}:${o.key}`, o]));

  function update(idx: number, patch: Partial<SiteTopTemplateItem>) {
    setForm({
      ...form,
      topTemplate: items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    });
  }
  function add() {
    const first = demoOptions[0];
    const blank: SiteTopTemplateItem = {
      kind: first?.kind ?? 'style',
      key: first?.key ?? '',
      title: '',
      artist: '',
      views: 1000,
      startSec: 0,
    };
    setForm({ ...form, topTemplate: [...items, blank] });
  }
  function remove(idx: number) {
    setForm({ ...form, topTemplate: items.filter((_, i) => i !== idx) });
  }
  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j], next[idx]];
    setForm({ ...form, topTemplate: next });
  }

  const source = form.topSource ?? 'seed';

  return (
    <div className="space-y-6">
      <StudioSection
        title="Sursă"
        help="Ce vede vizitatorul pe /top. Template-ul de mai jos e folosit doar dacă alegi Template."
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-field="top.source">
          {(
            [
              {
                id: 'seed' as const,
                title: 'Listă demo',
                body: 'Listă de prezentare, fără piese reale. Bună la lansare, până ai generări.',
              },
              {
                id: 'live' as const,
                title: 'Din comenzile reale',
                body: 'Agregare din generările plătite ale site-ului.',
              },
              {
                id: 'template' as const,
                title: 'Alegi tu piesele',
                body: 'Alegi piesele din mostre și demo-uri, în ordinea de mai jos.',
              },
            ]
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setForm({ ...form, topSource: opt.id })}
              className={cn(
                'rounded-xl border px-4 py-3 text-left transition-colors',
                source === opt.id
                  ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/40'
                  : 'border-border hover:border-primary/30',
              )}
            >
              <div className="text-sm font-medium">{opt.title}</div>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{opt.body}</p>
            </button>
          ))}
        </div>
      </StudioSection>

      {source !== 'template' && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-3 text-xs text-amber-200 flex items-center justify-between gap-3">
            <span>
              Lista de mai jos nu apare pe site până nu comuți sursa pe „Alegi tu piesele”.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setForm({ ...form, topSource: 'template' })}
            >
              Folosește lista de mai jos
            </Button>
          </CardContent>
        </Card>
      )}

      <SubSection
        title="Lista de pe /top"
        subtitle="Alege piesele din mostre de stil, voci și demo-uri. Ordinea de mai jos e ordinea în top. Redarea pornește de la secunda setată; implicit melodia întreagă."
        action={
          <Button size="sm" variant="ghost" onClick={add} disabled={demoOptions.length === 0}>
            <Plus className="h-3.5 w-3.5" />
            Adaugă intrare
          </Button>
        }
      >
        {demoOptions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nu există niciun track audio pe acest site. Generează mostre în Catalog muzical
              sau încarcă melodii în Demo-uri, apoi revino aici.
            </CardContent>
          </Card>
        ) : items.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Niciun element în top. Apasă „Adaugă intrare".
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((it, idx) => (
              <TopWeekRow
                key={idx}
                idx={idx}
                total={items.length}
                item={it}
                demoOptions={demoOptions}
                audioUrl={audioByKey.get(`${it.kind}:${it.key}`)?.audioUrl}
                onUpdate={(patch) => update(idx, patch)}
                onRemove={() => remove(idx)}
                onMove={(dir) => move(idx, dir)}
              />
            ))}
          </div>
        )}
      </SubSection>
    </div>
  );
}

function TopWeekRow({
  idx,
  total,
  item,
  demoOptions,
  audioUrl,
  onUpdate,
  onRemove,
  onMove,
}: {
  idx: number;
  total: number;
  item: SiteTopTemplateItem;
  demoOptions: Array<{ kind: 'style' | 'voice' | 'demo'; key: string; label: string; audioUrl: string }>;
  audioUrl?: string;
  onUpdate: (patch: Partial<SiteTopTemplateItem>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewOn = !!item.previewSec && item.previewSec > 0;
  const missing = !demoOptions.some((o) => o.kind === item.kind && o.key === item.key);
  const startSec = item.startSec ?? 0;

  function seekToStart() {
    const el = audioRef.current;
    if (!el || startSec <= 0) return;
    if (Number.isFinite(el.duration) && startSec < el.duration) {
      el.currentTime = startSec;
    }
  }

  // Reface seek-ul când se schimbă secunda de start (input sau „Din player"),
  // ca preview-ul să reflecte imediat punctul nou.
  useEffect(() => {
    seekToStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSec, audioUrl]);

  function setStartFromPlayer() {
    const el = audioRef.current;
    if (!el) return;
    onUpdate({ startSec: Math.floor(el.currentTime) });
  }

  return (
    <Card>
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold w-7 text-center text-muted-foreground">
            {idx === 0 ? '👑' : `#${idx + 1}`}
          </div>
          <select
            value={`${item.kind}:${item.key}`}
            onChange={(e) => {
              const [kind, ...rest] = e.target.value.split(':');
              onUpdate({ kind: kind as 'style' | 'voice' | 'demo', key: rest.join(':') });
            }}
            className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm"
          >
            {missing && (
              <option value={`${item.kind}:${item.key}`}>
                ⚠️ mostră lipsă ({item.kind}:{item.key})
              </option>
            )}
            {demoOptions.map((o) => (
              <option key={`${o.kind}:${o.key}`} value={`${o.kind}:${o.key}`}>
                {o.label}
              </option>
            ))}
          </select>
          <Button size="icon" variant="ghost" onClick={() => onMove(-1)} disabled={idx === 0} title="Mută sus">
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onMove(1)}
            disabled={idx === total - 1}
            title="Mută jos"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onRemove} title="Șterge">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>

        {audioUrl ? (
          <audio
            ref={audioRef}
            controls
            src={audioUrl}
            className="w-full h-8"
            preload="metadata"
            onLoadedMetadata={seekToStart}
          />
        ) : (
          <div className="text-[11px] text-destructive">
            ⚠️ Mostra selectată nu are audio (a fost ștearsă?). Alege alta din listă.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Titlu afișat">
            <Input
              value={item.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
              placeholder="Manea pentru Costel șeful"
            />
          </Field>
          <Field label="Artist afișat">
            <Input
              value={item.artist}
              onChange={(e) => onUpdate({ artist: e.target.value })}
              placeholder="Adi Șampanie"
            />
          </Field>
          <Field label="Vizualizări afișate">
            <Input
              type="number"
              min={0}
              value={item.views}
              onChange={(e) => onUpdate({ views: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
            />
          </Field>
          <Field label="Secunda de start (skip intro)">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                value={item.startSec ?? 0}
                onChange={(e) =>
                  onUpdate({ startSec: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
                }
              />
              <Button
                size="sm"
                variant="outline"
                onClick={setStartFromPlayer}
                disabled={!audioUrl}
                title="Pune secunda curentă din player-ul de mai sus"
              >
                Din player
              </Button>
            </div>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Switch
            checked={previewOn}
            onCheckedChange={(v) =>
              onUpdate({ previewSec: v ? (item.previewSec && item.previewSec > 0 ? item.previewSec : 30) : 0 })
            }
          />
          <span className="text-xs text-muted-foreground">
            Limitează la preview (altfel: melodia întreagă de la secunda de start)
          </span>
          {previewOn && (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={1}
                className="w-20"
                value={item.previewSec ?? 30}
                onChange={(e) =>
                  onUpdate({ previewSec: Math.max(1, Math.floor(Number(e.target.value) || 1)) })
                }
              />
              <span className="text-xs text-muted-foreground">sec</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
