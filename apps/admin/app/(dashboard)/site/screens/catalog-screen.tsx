'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, RefreshCcw, RotateCcw, Sparkles, Wand2 } from 'lucide-react';
import {
  SitesApi,
  type SamplesListDto,
  type SampleStatusDto,
  type SiteDto,
  type SiteOccasionEntry,
  type SiteStyleEntry,
  type SiteVoiceEntry,
} from '@/lib/api/sites.api';
import { SEED_OCCASIONS, SEED_STYLES, SEED_VOICES } from '@/lib/seed-categories';
import { useToast } from '@/components/ui/use-toast';
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
import {
  SampleChooserDialog,
  type PendingChoice,
} from '@/components/site/sample-chooser-dialog';
import type { SampleCandidateDto } from '@/lib/api/sites.api';
import { cn } from '@/lib/cn';
import { useSpaNavigate, useSpaPathname } from '@/lib/spa-router';
import { OccasionCard } from '../catalog/occasion-card';
import { OccasionPanel } from '../catalog/occasion-panel';
import { slugifyId } from '../catalog/helpers';
import { StyleCard } from '../catalog/style-card';
import { StylePanel } from '../catalog/style-panel';
import type { CatalogKind, GenerateOverrides, MusicEngine, SampleKind } from '../catalog/types';
import { VoiceCard } from '../catalog/voice-card';
import { VoicePanel } from '../catalog/voice-panel';
import { GLOBAL_VOICE_IDS } from '../studio-constants';
import { consumeStudioFocus, highlightStudioField, matchStudioPath, peekStudioFocus } from '../studio-nav';
import { StudioSection } from '../studio-primitives';

const SUBNAV: Array<{ kind: CatalogKind; href: string; label: string }> = [
  { kind: 'styles', href: '/site/catalog/styles', label: 'Stiluri' },
  { kind: 'occasions', href: '/site/catalog/occasions', label: 'Ocazii' },
  { kind: 'voices', href: '/site/catalog/voices', label: 'Voci' },
];

export function CatalogScreen({
  siteId,
  form,
  setForm,
  samples,
  onSamplesChange,
  onRefresh,
  onSavePartial,
  seedNonce = 0,
}: {
  siteId: string;
  form: SiteDto;
  setForm: (f: SiteDto) => void;
  samples: SamplesListDto | null;
  onSamplesChange: (next: SamplesListDto) => void;
  onRefresh: () => void;
  onSavePartial: (patch: Partial<SiteDto>) => Promise<boolean>;
  seedNonce?: number;
}) {
  const { toast } = useToast();
  const navigate = useSpaNavigate();
  const pathname = useSpaPathname();
  const kind: CatalogKind = matchStudioPath(pathname).catalogKind ?? 'styles';
  const engine: MusicEngine = form.musicEngine === 'google' ? 'google' : 'suno';

  const [busyKeys, setBusyKeys] = useState<Set<string>>(() => new Set());
  const [pendingChoices, setPendingChoices] = useState<PendingChoice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addId, setAddId] = useState('');
  const [addName, setAddName] = useState('');

  const markBusy = useCallback((token: string, on: boolean) => {
    setBusyKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(token);
      else next.delete(token);
      return next;
    });
  }, []);

  useEffect(() => {
    const pending = peekStudioFocus();
    if (pending?.catalogKind && pending.catalogKind !== kind) {
      setSelectedId(null);
      setAddOpen(false);
      return;
    }
    setAddOpen(false);
    if (!pending) {
      setSelectedId(null);
    }
  }, [kind]);

  const seededForSiteRef = useRef<string | null>(null);
  useEffect(() => {
    seededForSiteRef.current = null;
  }, [seedNonce]);
  useEffect(() => {
    if (seededForSiteRef.current === siteId) return;
    seededForSiteRef.current = siteId;
    const patch: Partial<SiteDto> = {};
    if (!form.styles?.length) {
      patch.styles = SEED_STYLES;
    } else {
      const seedById = new Map(SEED_STYLES.map((s) => [s.id, s]));
      let mutated = false;
      const merged = form.styles.map((s) => {
        const seed = seedById.get(s.id);
        if (!seed) return s;
        const missingSuno = !s.sunoPrompt && !!seed.sunoPrompt;
        const missingHint = !s.lyricsHint && !!seed.lyricsHint;
        const missingGoogle = !s.googlePrompt && !!seed.googlePrompt;
        if (!missingSuno && !missingHint && !missingGoogle) return s;
        mutated = true;
        return {
          ...s,
          sunoPrompt: s.sunoPrompt || seed.sunoPrompt,
          lyricsHint: s.lyricsHint || seed.lyricsHint,
          googlePrompt: s.googlePrompt || seed.googlePrompt,
        };
      });
      if (mutated) patch.styles = merged;
    }
    if (!form.voices?.length) patch.voices = SEED_VOICES;
    if (!form.occasions?.length) {
      patch.occasions = SEED_OCCASIONS;
    } else {
      const seedOcc = new Map(SEED_OCCASIONS.map((o) => [o.id, o]));
      let mutatedOcc = false;
      const mergedOcc = form.occasions.map((o) => {
        const seed = seedOcc.get(o.id);
        if (!seed) return o;
        const missingSuno = !o.sunoPrompt && !!seed.sunoPrompt;
        const missingGoogle = !o.googlePrompt && !!seed.googlePrompt;
        if (!missingSuno && !missingGoogle) return o;
        mutatedOcc = true;
        return {
          ...o,
          sunoPrompt: o.sunoPrompt || seed.sunoPrompt,
          googlePrompt: o.googlePrompt || seed.googlePrompt,
        };
      });
      if (mutatedOcc) patch.occasions = mergedOcc;
    }
    if (Object.keys(patch).length > 0) {
      setForm({ ...form, ...patch });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, seedNonce]);

  const seededStyles = form.styles === SEED_STYLES;
  const seededOccasions = form.occasions === SEED_OCCASIONS;
  const seededVoices = form.voices === SEED_VOICES;
  const anySeeded = seededStyles || seededOccasions || seededVoices;

  const styles = form.styles ?? [];
  const occasions = form.occasions ?? [];
  const voices = form.voices ?? [];

  useEffect(() => {
    if (!selectedId) return;
    const ids =
      kind === 'styles' ? styles.map((s) => s.id) : kind === 'occasions' ? occasions.map((o) => o.id) : voices.map((v) => v.id);
    if (!ids.includes(selectedId)) setSelectedId(null);
  }, [selectedId, kind, styles, occasions, voices]);

  useEffect(() => {
    const focus = peekStudioFocus();
    if (!focus) return;
    if (focus.catalogKind && focus.catalogKind !== kind) return;
    const list =
      kind === 'styles' ? styles : kind === 'occasions' ? occasions : voices;
    if (list.length === 0) return;
    consumeStudioFocus();
    const byId = focus.catalogId ? list.find((x) => x.id === focus.catalogId) : undefined;
    let pick = byId?.id ?? null;
    if (!pick && kind === 'styles') {
      if (focus.fieldId?.includes('googlePrompt')) {
        pick = styles.find((s) => !s.googlePrompt?.trim())?.id ?? styles[0]?.id ?? null;
      } else if (focus.fieldId?.includes('sunoPrompt')) {
        pick = styles.find((s) => !s.sunoPrompt?.trim())?.id ?? styles[0]?.id ?? null;
      } else if (focus.fieldId?.startsWith('catalog.')) {
        pick = styles[0]?.id ?? null;
      }
    } else if (!pick && kind === 'occasions') {
      if (focus.fieldId?.includes('googlePrompt')) {
        pick = occasions.find((o) => !o.googlePrompt?.trim())?.id ?? occasions[0]?.id ?? null;
      } else if (focus.fieldId?.includes('sunoPrompt')) {
        pick = occasions.find((o) => !o.sunoPrompt?.trim())?.id ?? occasions[0]?.id ?? null;
      } else if (focus.fieldId?.startsWith('catalog.')) {
        pick = occasions[0]?.id ?? null;
      }
    } else if (!pick && focus.fieldId?.startsWith('catalog.')) {
      pick = voices[0]?.id ?? null;
    }
    if (pick) setSelectedId(pick);
    if (focus.fieldId) highlightStudioField(focus.fieldId);
  }, [kind, styles, occasions, voices]);

  const styleSample = (key: string) => samples?.styles.find((s) => s.key === key) ?? null;
  const voiceSample = (key: string) => samples?.voices.find((s) => s.key === key) ?? null;

  function entryLabel(sampleKind: SampleKind, key: string): string {
    if (sampleKind === 'voice') return voices.find((v) => v.id === key)?.nm || key;
    return styles.find((s) => s.id === key)?.nm || key;
  }

  async function generateOne(
    sampleKind: SampleKind,
    key: string,
    regenerate: boolean,
    overrides?: GenerateOverrides,
  ) {
    const token = `${sampleKind}-${key}`;
    markBusy(token, true);
    if (samples) {
      onSamplesChange(updateSampleLocal(samples, sampleKind, key, (e) => ({ ...e, generating: true })));
    }
    try {
      const res = await SitesApi.generateSample(siteId, { kind: sampleKind, key, regenerate, ...(overrides ?? {}) });
      if (res.reused) {
        toast({ variant: 'success', title: 'Mostra există deja', description: `${sampleKind}=${key}` });
        const fresh = await SitesApi.listSamples(siteId);
        onSamplesChange(fresh);
      } else {
        const choice: PendingChoice = {
          queueId: `${sampleKind}-${key}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind: sampleKind,
          key,
          label: entryLabel(sampleKind, key),
          candidates: res.candidates,
          sunoTaskId: res.sunoTaskId,
        };
        setPendingChoices((prev) => [...prev, choice]);
        toast({
          variant: 'success',
          title: 'Mostra generată — alege varianta',
          description: `${sampleKind}=${key} · ${res.candidates.length} variante`,
        });
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare generare', description: (err as Error).message });
      if (samples) {
        onSamplesChange(updateSampleLocal(samples, sampleKind, key, (e) => ({ ...e, generating: false })));
      }
    } finally {
      markBusy(token, false);
    }
  }

  async function updateSampleStartSec(sampleKind: SampleKind, key: string, sec: number) {
    if (!samples) return;
    onSamplesChange(
      updateSampleLocal(samples, sampleKind, key, (s) =>
        s.entry ? { ...s, entry: { ...s.entry, startSec: sec || undefined } } : s,
      ),
    );
    try {
      await SitesApi.updateSampleStartSec(siteId, { kind: sampleKind, key, startSec: sec });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare la salvare', description: (err as Error).message });
      // Refetch-ul de recuperare nu are voie să arunce din interiorul catch-ului
      // (ar deveni unhandled rejection). Dacă pică și el, rămâne valoarea optimistă.
      try {
        const fresh = await SitesApi.listSamples(siteId);
        onSamplesChange(fresh);
      } catch {
        /* lista rămâne cea locală — eroarea principală e deja raportată */
      }
    }
  }

  async function uploadSample(sampleKind: SampleKind, key: string, file: File) {
    const token = `${sampleKind}-${key}`;
    markBusy(token, true);
    try {
      await SitesApi.uploadSample(siteId, sampleKind, key, file);
      const fresh = await SitesApi.listSamples(siteId);
      onSamplesChange(fresh);
      toast({ variant: 'success', title: 'Upload reușit' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Upload eșuat', description: (err as Error).message });
    } finally {
      markBusy(token, false);
    }
  }

  async function handleChoose(choice: PendingChoice, candidate: SampleCandidateDto) {
    try {
      await SitesApi.commitSampleChoice(siteId, {
        kind: choice.kind,
        key: choice.key,
        audioUrl: candidate.audioUrl,
        audioId: candidate.audioId,
        sunoTaskId: choice.sunoTaskId,
        durationSec: candidate.durationSec,
      });
      toast({ variant: 'success', title: 'Mostra salvată', description: `${choice.kind}=${choice.key}` });
      const fresh = await SitesApi.listSamples(siteId);
      onSamplesChange(fresh);
      setPendingChoices((prev) => prev.filter((c) => c.queueId !== choice.queueId));
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare la salvare', description: (err as Error).message });
      throw err;
    }
  }

  function handleSkip(choice: PendingChoice) {
    setPendingChoices((prev) => prev.filter((c) => c.queueId !== choice.queueId));
    if (samples) {
      onSamplesChange(
        updateSampleLocal(samples, choice.kind, choice.key, (e) => ({ ...e, generating: false })),
      );
    }
  }

  async function generateAllMissing() {
    if (!samples) return;
    const missing = [
      ...samples.styles.filter((s) => !s.entry).map((s) => s.key),
      ...samples.voices.filter((s) => !s.entry).map((s) => s.key),
    ];
    if (missing.length === 0) {
      toast({ title: 'Nimic de făcut', description: 'Toate mostrele sunt generate.' });
      return;
    }
    const ok = await confirmDialog({
      title: `Generezi ${missing.length} mostre?`,
      description: `Cost estimat: ~${missing.length * 10} credite Suno. ~3 min/mostră.`,
      confirmText: 'Da, generează',
    });
    if (!ok) return;
    try {
      await SitesApi.generateAllSamples(siteId, { regenerate: false });
      const fresh = await SitesApi.listSamples(siteId);
      onSamplesChange(fresh);
      toast({ variant: 'success', title: 'Pornite', description: `${missing.length} mostre la coadă.` });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare', description: (err as Error).message });
    }
  }

  async function commitAdd() {
    if (kind === 'voices') return;
    const id = slugifyId(addId);
    const nm = addName.trim();
    if (!id || !nm) {
      toast({ variant: 'destructive', title: 'Completează codul intern și numele' });
      return;
    }
    if (kind === 'styles' && styles.some((s) => s.id === id)) {
      toast({ variant: 'destructive', title: 'Cod intern deja folosit', description: id });
      return;
    }
    if (kind === 'occasions' && occasions.some((o) => o.id === id)) {
      toast({ variant: 'destructive', title: 'Cod intern deja folosit', description: id });
      return;
    }
    if (kind === 'styles') {
      const blank: SiteStyleEntry = { id, em: '🎵', nm, ds: '' };
      const next = [...styles, blank];
      const saved = await onSavePartial({ styles: next });
      if (!saved) return;
      setAddOpen(false);
      setSelectedId(id);
      return;
    }
    const blank: SiteOccasionEntry = { id, em: '✨', nm };
    const next = [...occasions, blank];
    const saved = await onSavePartial({ occasions: next });
    if (!saved) return;
    setAddOpen(false);
    setSelectedId(id);
  }

  async function removeStyle(idx: number) {
    const entry = styles[idx];
    const ok = await confirmDialog({
      title: `Șterge ${entry?.nm || entry?.id}?`,
      description: 'Vei elimina acest stil din site. Mostra audio existentă rămâne pe disc dar nu mai e vizibilă.',
      confirmText: 'Șterge',
      variant: 'destructive',
    });
    if (!ok) return;
    const next = styles.filter((_, i) => i !== idx);
    const saved = await onSavePartial({ styles: next });
    if (saved && selectedId === entry.id) setSelectedId(null);
  }

  async function removeOccasion(idx: number) {
    const entry = occasions[idx];
    const ok = await confirmDialog({
      title: `Șterge ${entry?.nm || entry?.id}?`,
      description: 'Vei elimina această ocazie din site.',
      confirmText: 'Șterge',
      variant: 'destructive',
    });
    if (!ok) return;
    const next = occasions.filter((_, i) => i !== idx);
    const saved = await onSavePartial({ occasions: next });
    if (saved && selectedId === entry.id) setSelectedId(null);
  }

  function moveIn<T>(list: T[], idx: number, dir: -1 | 1): T[] | null {
    const j = idx + dir;
    if (j < 0 || j >= list.length) return null;
    const next = [...list];
    [next[idx], next[j]] = [next[j], next[idx]];
    return next;
  }

  function updateStyle(idx: number, patch: Partial<SiteStyleEntry>) {
    const next = [...styles];
    next[idx] = { ...next[idx], ...patch };
    setForm({ ...form, styles: next });
    if (patch.id && selectedId === styles[idx].id) setSelectedId(patch.id);
  }
  function updateOccasion(idx: number, patch: Partial<SiteOccasionEntry>) {
    const next = [...occasions];
    next[idx] = { ...next[idx], ...patch };
    setForm({ ...form, occasions: next });
    if (patch.id && selectedId === occasions[idx].id) setSelectedId(patch.id);
  }
  function updateVoice(idx: number, patch: Partial<SiteVoiceEntry>) {
    const next = [...voices];
    next[idx] = { ...next[idx], ...patch };
    setForm({ ...form, voices: next });
  }

  const selectedStyleIdx = kind === 'styles' ? styles.findIndex((s) => s.id === selectedId) : -1;
  const selectedOccasionIdx = kind === 'occasions' ? occasions.findIndex((o) => o.id === selectedId) : -1;
  const selectedVoiceIdx = kind === 'voices' ? voices.findIndex((v) => v.id === selectedId) : -1;

  const count = kind === 'styles' ? styles.length : kind === 'occasions' ? occasions.length : voices.length;
  const backLabel = kind === 'styles' ? 'Toate stilurile' : kind === 'occasions' ? 'Toate ocaziile' : 'Toate vocile';
  const missingEngine =
    kind === 'styles'
      ? styles.filter((s) => (engine === 'google' ? !s.googlePrompt?.trim() : !s.sunoPrompt?.trim()))
      : kind === 'occasions'
        ? occasions.filter((o) => (engine === 'google' ? !o.googlePrompt?.trim() : !o.sunoPrompt?.trim()))
        : [];
  const enginePromptLabel = engine === 'google' ? 'Google Lyria' : 'Suno';

  return (
    <div className="space-y-4" data-field={`catalog.${kind}`}>
      <StudioSection
        title="Librărie tenant"
        help="Nu e vitrina. Aici ții stiluri / ocazii / voci comune. Generatorul folosește catalogul interfeței; dacă interfața moștenește, ia de aici. Copiază în Interfețe → Catalog."
      >
        <div className="flex gap-1 border-b border-border">
          {SUBNAV.map((item) => (
            <button
              key={item.kind}
              type="button"
              onClick={() => navigate(item.href)}
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
      </StudioSection>

      {missingEngine.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-3 text-sm flex items-center justify-between gap-3 flex-wrap">
            <span className="text-amber-200">
              {missingEngine.length}{' '}
              {kind === 'styles' ? (missingEngine.length === 1 ? 'stil' : 'stiluri') : missingEngine.length === 1 ? 'ocazie' : 'ocazii'}{' '}
              fără prompt {enginePromptLabel}. Click pe cardul cu pastila „lipsă”, sau deschide primul.
            </span>
            <Button size="sm" variant="outline" onClick={() => setSelectedId(missingEngine[0].id)}>
              Deschide primul
            </Button>
          </CardContent>
        </Card>
      )}

      {anySeeded && (
        <Card className="border-dashed border-primary/40 bg-primary/5">
          <CardContent className="p-3 text-sm flex items-start gap-3">
            <Sparkles className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="space-y-1">
              <div className="font-medium text-foreground">Listă default pre-completată</div>
              <div className="text-muted-foreground text-xs leading-relaxed">
                {[
                  seededStyles ? `${SEED_STYLES.length} stiluri` : null,
                  seededOccasions ? `${SEED_OCCASIONS.length} ocazii` : null,
                  seededVoices ? `${SEED_VOICES.length} voci` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}{' '}
                preluate din lista default. Nu sunt pe site până apeși Salvează sus.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
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
          <Button size="sm" variant="outline" onClick={() => void generateAllMissing()}>
            <Wand2 className="h-3.5 w-3.5" />
            Generează mostrele lipsă
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const ok = await confirmDialog({
                title: 'Regenerezi TOATE mostrele?',
                description: 'Cost estimat ridicat. Mostrele existente vor fi suprascrise.',
                confirmText: 'Da, regenerează tot',
                variant: 'destructive',
              });
              if (!ok) return;
              try {
                await SitesApi.generateAllSamples(siteId, { regenerate: true });
                onRefresh();
              } catch (err) {
                toast({ variant: 'destructive', title: 'Eroare', description: (err as Error).message });
              }
            }}
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Regenerează tot
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 ml-auto"
            onClick={async () => {
              const ok = await confirmDialog({
                title: 'Reset complet categorii?',
                description:
                  'Șterge stilurile, vocile și ocaziile personalizate și le înlocuiește cu default-ul. Mostrele audio vor fi șterse. Ireversibil fără backup.',
                confirmText: 'Da, resetează la default',
                variant: 'destructive',
              });
              if (!ok) return;
              const patch = { styles: SEED_STYLES, voices: SEED_VOICES, occasions: SEED_OCCASIONS };
              const saved = await onSavePartial(patch);
              if (!saved) return;
              // Dialogul promite explicit că se șterg și mostrele — dacă pasul ăsta
              // pică, spunem pe față că resetul a fost doar parțial.
              let samplesError: string | null = null;
              try {
                await SitesApi.clearAllSamples(siteId);
              } catch (err) {
                samplesError = (err as Error).message;
              }
              onRefresh();
              if (samplesError) {
                toast({
                  variant: 'warning',
                  title: 'Reset parțial',
                  description: `Categoriile au fost resetate, dar mostrele audio n-au putut fi șterse: ${samplesError}`,
                });
              } else {
                toast({ variant: 'success', title: 'Reset efectuat' });
              }
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset la default
          </Button>
        </CardContent>
      </Card>

      <div className="flex gap-4 items-start">
        <div className={cn('flex-1 min-w-0', selectedId && 'hidden lg:block')}>
          {count === 0 ? (
            <EmptyHint kind={kind} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {kind === 'styles' &&
                styles.map((s) => (
                  <StyleCard
                    key={s.id}
                    entry={s}
                    selected={selectedId === s.id}
                    engine={engine}
                    sample={styleSample(s.id)}
                    busy={busyKeys.has(`style-${s.id}`)}
                    onSelect={() => setSelectedId(s.id)}
                  />
                ))}
              {kind === 'occasions' &&
                occasions.map((o) => (
                  <OccasionCard
                    key={o.id}
                    entry={o}
                    selected={selectedId === o.id}
                    engine={engine}
                    onSelect={() => setSelectedId(o.id)}
                  />
                ))}
              {kind === 'voices' &&
                voices.map((v) => (
                  <VoiceCard
                    key={v.id}
                    entry={v}
                    selected={selectedId === v.id}
                    sample={voiceSample(v.id)}
                    busy={busyKeys.has(`voice-${v.id}`)}
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
                entry={styles[selectedStyleIdx]}
                idx={selectedStyleIdx}
                total={styles.length}
                engine={engine}
                sample={styleSample(styles[selectedStyleIdx].id)}
                busy={busyKeys.has(`style-${styles[selectedStyleIdx].id}`)}
                site={form}
                siteId={siteId}
                voiceKeys={GLOBAL_VOICE_IDS}
                onChange={(patch) => updateStyle(selectedStyleIdx, patch)}
                onMove={(dir) => {
                  const next = moveIn(styles, selectedStyleIdx, dir);
                  if (next) setForm({ ...form, styles: next });
                }}
                onRemove={() => void removeStyle(selectedStyleIdx)}
                onGenerate={(regen, ov) => void generateOne('style', styles[selectedStyleIdx].id, regen, ov)}
                onUpload={(file) => void uploadSample('style', styles[selectedStyleIdx].id, file)}
                onUpdateStartSec={(sec) => void updateSampleStartSec('style', styles[selectedStyleIdx].id, sec)}
              />
            )}
            {kind === 'occasions' && selectedOccasionIdx >= 0 && (
              <OccasionPanel
                entry={occasions[selectedOccasionIdx]}
                idx={selectedOccasionIdx}
                total={occasions.length}
                engine={engine}
                site={form}
                onChange={(patch) => updateOccasion(selectedOccasionIdx, patch)}
                onMove={(dir) => {
                  const next = moveIn(occasions, selectedOccasionIdx, dir);
                  if (next) setForm({ ...form, occasions: next });
                }}
                onRemove={() => void removeOccasion(selectedOccasionIdx)}
              />
            )}
            {kind === 'voices' && selectedVoiceIdx >= 0 && (
              <VoicePanel
                entry={voices[selectedVoiceIdx]}
                idx={selectedVoiceIdx}
                total={voices.length}
                sample={voiceSample(voices[selectedVoiceIdx].id)}
                busy={busyKeys.has(`voice-${voices[selectedVoiceIdx].id}`)}
                site={form}
                siteId={siteId}
                onChange={(patch) => updateVoice(selectedVoiceIdx, patch)}
                onMove={(dir) => {
                  const next = moveIn(voices, selectedVoiceIdx, dir);
                  if (next) setForm({ ...form, voices: next });
                }}
                onGenerate={(regen, ov) => void generateOne('voice', voices[selectedVoiceIdx].id, regen, ov)}
                onUpload={(file) => void uploadSample('voice', voices[selectedVoiceIdx].id, file)}
                onUpdateStartSec={(sec) => void updateSampleStartSec('voice', voices[selectedVoiceIdx].id, sec)}
              />
            )}
          </div>
        ) : (
          <div className="hidden lg:block min-w-[380px] max-w-[520px] sticky top-16">
            <Card className="border-dashed">
              <CardContent className="p-6 text-sm text-muted-foreground">
                Alege un {kind === 'styles' ? 'stil' : kind === 'occasions' ? 'ocazie' : 'voce'} din listă ca să-i editezi detaliile.
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <SampleChooserDialog
        current={pendingChoices[0] ?? null}
        remaining={Math.max(0, pendingChoices.length - 1)}
        onChoose={handleChoose}
        onSkip={handleSkip}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{kind === 'styles' ? 'Stil nou' : 'Ocazie nouă'}</DialogTitle>
            <DialogDescription>
              Numele e ce vede clientul. Codul intern nu se mai schimbă după ce ai mostre sau comenzi.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void commitAdd();
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

function updateSampleLocal(
  d: SamplesListDto,
  kind: SampleKind,
  key: string,
  patch: (s: SampleStatusDto) => SampleStatusDto,
): SamplesListDto {
  const k = kind === 'style' ? 'styles' : 'voices';
  return { ...d, [k]: d[k].map((s) => (s.key === key ? patch(s) : s)) } as SamplesListDto;
}

function EmptyHint({ kind }: { kind: CatalogKind }) {
  const label = kind === 'styles' ? 'stil' : kind === 'occasions' ? 'ocazie' : 'voce';
  return (
    <Card className="border-dashed">
      <CardContent className="py-6 text-center text-sm text-muted-foreground">
        Nicio {label} configurată. Site-ul folosește lista default (seed-data).
        {kind !== 'voices' ? ' Apasă „Adaugă" pentru a customiza.' : ''}
      </CardContent>
    </Card>
  );
}
