'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { SitesApi } from '@/lib/api/sites.api';
import type {
  ExperienceCatalogConfig,
  ExperienceOccasionOverride,
  ExperienceStyleOverride,
  ExperienceVoiceOverride,
  SiteDto,
} from '@/lib/api/sites.api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { OccasionCard } from '../catalog/occasion-card';
import { OccasionPanel } from '../catalog/occasion-panel';
import { slugifyId } from '../catalog/helpers';
import { StyleCard } from '../catalog/style-card';
import { StylePanel } from '../catalog/style-panel';
import type { CatalogKind, MusicEngine } from '../catalog/types';
import { VoiceCard } from '../catalog/voice-card';
import { VoicePanel } from '../catalog/voice-panel';
import { Field } from '../studio-primitives';
import { GLOBAL_VOICE_IDS } from '../studio-constants';
import {
  asOccasionEntry,
  asStyleEntry,
  asVoiceEntry,
  mergeOccasion,
  mergeStyle,
  mergeVoice,
  missingGlobalVoices,
  sampleFromUrl,
} from './config';

const SUBNAV: Array<{ kind: CatalogKind; label: string }> = [
  { kind: 'styles', label: 'Stiluri' },
  { kind: 'occasions', label: 'Ocazii' },
  { kind: 'voices', label: 'Voci' },
];

export function ExperienceCatalogEditor({
  site,
  slug,
  catalog,
  onChange,
}: {
  site: SiteDto;
  slug: string;
  catalog: ExperienceCatalogConfig;
  onChange: (c: ExperienceCatalogConfig) => void;
}) {
  const engine: MusicEngine = site.musicEngine === 'google' ? 'google' : 'suno';
  const styles = catalog.styles ?? [];
  const occasions = catalog.occasions ?? [];
  const voices = catalog.voices ?? [];
  const [kind, setKind] = useState<CatalogKind>('styles');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addId, setAddId] = useState('');
  const [addName, setAddName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const selectedStyleIdx = kind === 'styles' ? styles.findIndex((s) => s.id === selectedId) : -1;
  const selectedOccasionIdx = kind === 'occasions' ? occasions.findIndex((o) => o.id === selectedId) : -1;
  const selectedVoiceIdx = kind === 'voices' ? voices.findIndex((v) => v.id === selectedId) : -1;
  const count = kind === 'styles' ? styles.length : kind === 'occasions' ? occasions.length : voices.length;
  const backLabel = kind === 'styles' ? 'Toate stilurile' : kind === 'occasions' ? 'Toate ocaziile' : 'Toate vocile';
  const missingVoices = missingGlobalVoices(voices);

  function setStyles(next: ExperienceStyleOverride[]) {
    const c: ExperienceCatalogConfig = { ...catalog, styles: next };
    if (!next.length) delete c.styles;
    onChange(c);
  }
  function setOccasions(next: ExperienceOccasionOverride[]) {
    const c: ExperienceCatalogConfig = { ...catalog, occasions: next };
    if (!next.length) delete c.occasions;
    onChange(c);
  }
  function setVoices(next: ExperienceVoiceOverride[]) {
    const c: ExperienceCatalogConfig = { ...catalog, voices: next };
    if (!next.length) delete c.voices;
    onChange(c);
  }

  function moveIn<T>(list: T[], idx: number, dir: -1 | 1): T[] | null {
    const j = idx + dir;
    if (j < 0 || j >= list.length) return null;
    const next = [...list];
    [next[idx], next[j]] = [next[j], next[idx]];
    return next;
  }

  async function removeStyle(idx: number) {
    const entry = styles[idx];
    const ok = await confirmDialog({
      title: `Șterge ${entry?.nm || entry?.id}?`,
      description: 'Doar din catalogul acestei interfețe. Catalogul site-ului rămâne neschimbat.',
      confirmText: 'Șterge',
      variant: 'destructive',
    });
    if (!ok) return;
    setStyles(styles.filter((_, i) => i !== idx));
    if (selectedId === entry.id) setSelectedId(null);
  }

  async function removeOccasion(idx: number) {
    const entry = occasions[idx];
    const ok = await confirmDialog({
      title: `Șterge ${entry?.nm || entry?.id}?`,
      description: 'Doar din catalogul acestei interfețe.',
      confirmText: 'Șterge',
      variant: 'destructive',
    });
    if (!ok) return;
    setOccasions(occasions.filter((_, i) => i !== idx));
    if (selectedId === entry.id) setSelectedId(null);
  }

  async function removeVoice(idx: number) {
    const entry = voices[idx];
    const ok = await confirmDialog({
      title: `Scoate ${entry?.nm || entry?.id}?`,
      description: 'Vocea dispare doar de pe această interfață.',
      confirmText: 'Scoate',
      variant: 'destructive',
    });
    if (!ok) return;
    setVoices(voices.filter((_, i) => i !== idx));
    if (selectedId === entry.id) setSelectedId(null);
  }

  function commitAdd() {
    const id = slugifyId(addId);
    const nm = addName.trim();
    if (!id || !nm) return;
    if (kind === 'styles') {
      if (styles.some((s) => s.id === id)) return;
      setStyles([...styles, { id, nm, em: '🎵' }]);
      setSelectedId(id);
    } else if (kind === 'occasions') {
      if (occasions.some((o) => o.id === id)) return;
      setOccasions([...occasions, { id, nm, em: '✨' }]);
      setSelectedId(id);
    }
    setAddOpen(false);
    setAddId('');
    setAddName('');
  }

  function addVoice(id: string) {
    if (voices.some((v) => v.id === id)) return;
    const seed = (site.voices ?? []).find((v) => v.id === id);
    const next: ExperienceVoiceOverride = seed
      ? {
          id: seed.id,
          nm: seed.nm,
          tg: seed.tg,
          av: seed.av,
          ic: seed.ic,
          i18n: seed.i18n,
          sunoVoice: seed.sunoVoice,
          gender: seed.gender,
          sunoPersonaId: seed.sunoPersonaId,
        }
      : {
          id,
          nm: id === 'female' ? 'Feminină' : 'Masculină',
          gender: id === 'female' ? 'f' : 'm',
        };
    setVoices([...voices, next]);
    setSelectedId(id);
  }

  async function uploadAsset(kind: 'art' | 'sample', styleId: string, file: File) {
    const key = `${kind}:${styleId}`;
    setBusy(key);
    try {
      const r = await SitesApi.uploadExperienceAsset(site.id, slug, kind, styleId, file);
      setStyles(
        styles.map((s) =>
          s.id === styleId ? (kind === 'art' ? { ...s, artUrl: r.url } : { ...s, sampleUrl: r.url }) : s,
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-border">
        {SUBNAV.map((item) => (
          <button
            key={item.kind}
            type="button"
            onClick={() => {
              setKind(item.kind);
              setSelectedId(null);
            }}
            className={cn(
              'px-3 py-2 text-sm border-b-2 -mb-px transition-colors',
              kind === item.kind
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
            <span className="ml-1.5 text-[10px] tabular-nums opacity-70">
              {item.kind === 'styles' ? styles.length : item.kind === 'occasions' ? occasions.length : voices.length}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {kind !== 'voices' && (
          <Button
            size="sm"
            onClick={() => {
              setAddId('');
              setAddName('');
              setAddOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            {kind === 'styles' ? 'Adaugă stil' : 'Adaugă ocazie'}
          </Button>
        )}
        {kind === 'voices' &&
          missingVoices.map((id) => (
            <Button key={id} size="sm" variant="outline" onClick={() => addVoice(id)}>
              <Plus className="h-3.5 w-3.5" />
              Adaugă {id === 'female' ? 'feminină' : 'masculină'}
            </Button>
          ))}
      </div>

      <div className="flex gap-4 items-start">
        <div className={cn('flex-1 min-w-0', selectedId && 'hidden lg:block')}>
          {count === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                {kind === 'styles' && 'Niciun stil pe această interfață. Adaugă sau copiază din catalogul site-ului.'}
                {kind === 'occasions' && 'Nicio ocazie pe această interfață.'}
                {kind === 'voices' && 'Nicio voce pe această interfață. Adaugă masculin / feminin.'}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {kind === 'styles' &&
                styles.map((s) => (
                  <StyleCard
                    key={s.id}
                    entry={asStyleEntry(s)}
                    selected={selectedId === s.id}
                    engine={engine}
                    sample={sampleFromUrl(s.id, s.sampleUrl, s.sampleStartSec)}
                    busy={busy === `sample:${s.id}` || busy === `art:${s.id}`}
                    onSelect={() => setSelectedId(s.id)}
                  />
                ))}
              {kind === 'occasions' &&
                occasions.map((o) => (
                  <OccasionCard
                    key={o.id}
                    entry={asOccasionEntry(o)}
                    selected={selectedId === o.id}
                    engine={engine}
                    onSelect={() => setSelectedId(o.id)}
                  />
                ))}
              {kind === 'voices' &&
                voices.map((v) => (
                  <VoiceCard
                    key={v.id}
                    entry={asVoiceEntry(v)}
                    selected={selectedId === v.id}
                    sample={null}
                    busy={false}
                    onSelect={() => setSelectedId(v.id)}
                  />
                ))}
            </div>
          )}
        </div>

        {selectedId ? (
          <div className="w-full lg:min-w-[380px] lg:max-w-[520px] lg:sticky lg:top-16">
            <div className="lg:hidden mb-2">
              <Button size="sm" variant="ghost" onClick={() => setSelectedId(null)}>
                ← {backLabel}
              </Button>
            </div>
            {kind === 'styles' && selectedStyleIdx >= 0 && (
              <StylePanel
                entry={asStyleEntry(styles[selectedStyleIdx])}
                idx={selectedStyleIdx}
                total={styles.length}
                engine={engine}
                sample={sampleFromUrl(
                  styles[selectedStyleIdx].id,
                  styles[selectedStyleIdx].sampleUrl,
                  styles[selectedStyleIdx].sampleStartSec,
                )}
                busy={busy === `sample:${styles[selectedStyleIdx].id}` || busy === `art:${styles[selectedStyleIdx].id}`}
                site={site}
                siteId={site.id}
                voiceKeys={GLOBAL_VOICE_IDS}
                hideSiteSamples
                onChange={(patch) => {
                  const next = [...styles];
                  const prev = next[selectedStyleIdx];
                  next[selectedStyleIdx] = mergeStyle(prev, patch);
                  setStyles(next);
                  if (patch.id && selectedId === prev.id) setSelectedId(patch.id);
                }}
                onMove={(dir) => {
                  const next = moveIn(styles, selectedStyleIdx, dir);
                  if (next) setStyles(next);
                }}
                onRemove={() => void removeStyle(selectedStyleIdx)}
                extra={
                  <ExperienceAssets
                    style={styles[selectedStyleIdx]}
                    busy={busy}
                    onArt={(file) => void uploadAsset('art', styles[selectedStyleIdx].id, file)}
                    onSample={(file) => void uploadAsset('sample', styles[selectedStyleIdx].id, file)}
                    onStartSec={(sec) => {
                      const next = [...styles];
                      next[selectedStyleIdx] = {
                        ...next[selectedStyleIdx],
                        sampleStartSec: sec > 0 ? sec : undefined,
                      };
                      setStyles(next);
                    }}
                  />
                }
              />
            )}
            {kind === 'occasions' && selectedOccasionIdx >= 0 && (
              <OccasionPanel
                entry={asOccasionEntry(occasions[selectedOccasionIdx])}
                idx={selectedOccasionIdx}
                total={occasions.length}
                engine={engine}
                site={site}
                onChange={(patch) => {
                  const next = [...occasions];
                  const prev = next[selectedOccasionIdx];
                  next[selectedOccasionIdx] = mergeOccasion(prev, patch);
                  setOccasions(next);
                  if (patch.id && selectedId === prev.id) setSelectedId(patch.id);
                }}
                onMove={(dir) => {
                  const next = moveIn(occasions, selectedOccasionIdx, dir);
                  if (next) setOccasions(next);
                }}
                onRemove={() => void removeOccasion(selectedOccasionIdx)}
              />
            )}
            {kind === 'voices' && selectedVoiceIdx >= 0 && (
              <VoicePanel
                entry={asVoiceEntry(voices[selectedVoiceIdx])}
                idx={selectedVoiceIdx}
                total={voices.length}
                sample={null}
                busy={false}
                site={site}
                siteId={site.id}
                hideSiteSamples
                onChange={(patch) => {
                  const next = [...voices];
                  next[selectedVoiceIdx] = mergeVoice(next[selectedVoiceIdx], patch);
                  setVoices(next);
                }}
                onMove={(dir) => {
                  const next = moveIn(voices, selectedVoiceIdx, dir);
                  if (next) setVoices(next);
                }}
                extra={
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => void removeVoice(selectedVoiceIdx)}
                  >
                    Scoate vocea de pe interfață
                  </Button>
                }
              />
            )}
          </div>
        ) : (
          <div className="hidden lg:block min-w-[380px] max-w-[520px] sticky top-16">
            <Card className="border-dashed">
              <CardContent className="p-6 text-sm text-muted-foreground">
                Alege un {kind === 'styles' ? 'stil' : kind === 'occasions' ? 'ocazie' : 'voce'} din listă.
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{kind === 'styles' ? 'Stil nou pe interfață' : 'Ocazie nouă pe interfață'}</DialogTitle>
            <DialogDescription>
              Numele e ce vede clientul. Codul intern nu se mai schimbă după ce ai mostre pe el.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              commitAdd();
            }}
          >
            <div className="space-y-1">
              <Label>Cod intern</Label>
              <Input
                autoFocus
                value={addId}
                onChange={(e) => setAddId(slugifyId(e.target.value))}
                placeholder={kind === 'styles' ? 'ex. clasic' : 'ex. zi'}
              />
            </div>
            <div className="space-y-1">
              <Label>Nume</Label>
              <Input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder={kind === 'styles' ? 'ex. Clasică de pahar' : 'ex. Zi naștere'}
              />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
                Anulează
              </Button>
              <Button type="submit">Adaugă</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExperienceAssets({
  style,
  busy,
  onArt,
  onSample,
  onStartSec,
}: {
  style: ExperienceStyleOverride;
  busy: string | null;
  onArt: (file: File) => void;
  onSample: (file: File) => void;
  onStartSec: (sec: number) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <Field label="Poză card">
        {style.artUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={style.artUrl} alt="" className="mt-1 h-16 w-28 rounded object-cover" />
        )}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="mt-1 text-xs"
          disabled={busy === `art:${style.id}`}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onArt(f);
            e.target.value = '';
          }}
        />
      </Field>
      <Field label="Mostră audio (această interfață)">
        {style.sampleUrl && <audio controls src={style.sampleUrl} className="mt-1 w-full h-8" preload="metadata" />}
        <input
          type="file"
          accept="audio/mpeg,audio/wav,audio/mp4,.mp3,.wav,.m4a"
          className="mt-1 text-xs"
          disabled={busy === `sample:${style.id}`}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onSample(f);
            e.target.value = '';
          }}
        />
        <Input
          className="mt-1"
          type="number"
          min={0}
          value={style.sampleStartSec ?? ''}
          placeholder="start (sec)"
          onChange={(e) => {
            const raw = e.target.value.trim();
            onStartSec(raw === '' ? 0 : Number(raw) || 0);
          }}
        />
      </Field>
    </div>
  );
}
