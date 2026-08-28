'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlaskConical,
  Loader2,
  RotateCcw,
  Sparkles,
  Volume2,
} from 'lucide-react';
import type { SiteDto } from '@/lib/api/sites.api';
import {
  PlaygroundApi,
  type PlaygroundEngine,
  type PlaygroundLyricsMode,
  type PlaygroundMeta,
  type PlaygroundPreview,
  type PlaygroundRequest,
  type PlaygroundRun,
} from '@/lib/api/playground.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/cn';
import { LOCALES, LOCALE_LABELS } from '../studio-constants';
import { Field, StudioSection, Toggle } from '../studio-primitives';
import { humanExperienceLabel } from '../interfaces/config';

function absUrl(rel: string): string {
  if (!rel || rel.startsWith('http')) return rel;
  const base = process.env.NEXT_PUBLIC_API_URL ?? '';
  return `${base}${rel}`;
}

type Slim = { id: string; nm: string; sunoPrompt?: string; googlePrompt?: string; gender?: 'm' | 'f'; sunoPersonaId?: string; lyricsHint?: string; styleWeight?: number; weirdnessConstraint?: number; negativeTags?: string; sunoPersonaIdMale?: string; sunoPersonaIdFemale?: string };

function catalogOf(form: SiteDto, slug: string) {
  const cat = slug ? form.experienceConfig?.items?.[slug]?.catalog : undefined;
  const styles = (cat?.styles?.length ? cat.styles : form.styles ?? []) as Slim[];
  const occasions = (cat?.occasions?.length ? cat.occasions : form.occasions ?? []) as Slim[];
  const voices = (cat?.voices?.length ? cat.voices : form.voices ?? []) as Slim[];
  const writer = cat?.writerSystemPrompt?.trim() || form.suno?.writerSystemPrompt || '';
  return { styles, occasions, voices, writer };
}

function statusLabel(s: PlaygroundRun['status']): string {
  if (s === 'queued') return 'În coadă';
  if (s === 'writing_lyrics') return 'Scrie versuri…';
  if (s === 'generating_audio') return 'Generează audio…';
  if (s === 'succeeded') return 'Gata';
  return 'Eșuat';
}

export function PlaygroundScreen({ form }: { form: SiteDto }) {
  const { toast } = useToast();
  const [meta, setMeta] = useState<PlaygroundMeta | null>(null);
  const [engine, setEngine] = useState<PlaygroundEngine>(form.musicEngine === 'google' ? 'google' : 'suno');
  const [experienceSlug, setExperienceSlug] = useState('');
  const catalog = useMemo(() => catalogOf(form, experienceSlug), [form, experienceSlug]);

  const [styleId, setStyleId] = useState(catalog.styles[0]?.id ?? '');
  const [occasionId, setOccasionId] = useState(catalog.occasions[0]?.id ?? '');
  const [voiceId, setVoiceId] = useState(catalog.voices[0]?.id ?? '');
  const [recipient, setRecipient] = useState('Mirela');
  const [sender, setSender] = useState('Costel');
  const [message, setMessage] = useState('La mulți ani cu sănătate');
  const [tipAmount, setTipAmount] = useState('');
  const [durationSec, setDurationSec] = useState('120');
  const [lyricsMode, setLyricsMode] = useState<PlaygroundLyricsMode>('generate');
  const [lyrics, setLyrics] = useState('');
  const [lyricsDraft, setLyricsDraft] = useState('');
  const [phonetic, setPhonetic] = useState(form.lyricsReviewEnabled ?? true);
  const [skipCritic, setSkipCritic] = useState(false);
  const [openaiModel, setOpenaiModel] = useState('');
  const [locale, setLocale] = useState(form.suno?.lyricsLocale || form.locale);
  const [languageOverride, setLanguageOverride] = useState('');
  const [writerSystem, setWriterSystem] = useState(form.suno?.writerSystemPrompt || '');
  const [writerUser, setWriterUser] = useState(form.suno?.writerUserTemplate || '');
  const [criticSystem, setCriticSystem] = useState(form.suno?.criticSystemPrompt || '');
  const [criticUser, setCriticUser] = useState(form.suno?.criticUserTemplate || '');
  const [sunoModel, setSunoModel] = useState('');
  const [sunoCustomMode, setSunoCustomMode] = useState(true);
  const [sunoBase, setSunoBase] = useState(form.suno?.basePrompt || '');
  const [sunoStyle, setSunoStyle] = useState('');
  const [sunoOccasion, setSunoOccasion] = useState('');
  const [sunoRaw, setSunoRaw] = useState('');
  const [sunoTitle, setSunoTitle] = useState('');
  const [vocalGender, setVocalGender] = useState<'m' | 'f' | ''>('');
  const [styleWeight, setStyleWeight] = useState('');
  const [weirdness, setWeirdness] = useState('');
  const [negativeTags, setNegativeTags] = useState('');
  const [personaId, setPersonaId] = useState('');
  const [personaModel, setPersonaModel] = useState<'style_persona' | 'voice_persona'>('style_persona');
  const [instrumental, setInstrumental] = useState(false);
  const [lyriaModel, setLyriaModel] = useState('');
  const [lyriaStyle, setLyriaStyle] = useState('');
  const [lyriaOccasion, setLyriaOccasion] = useState('');
  const [lyriaRaw, setLyriaRaw] = useState('');
  const [showGpt, setShowGpt] = useState(false);
  const [showAudioAdvanced, setShowAudioAdvanced] = useState(false);
  const [busyLyrics, setBusyLyrics] = useState(false);
  const [busyGenerate, setBusyGenerate] = useState(false);
  const [preview, setPreview] = useState<PlaygroundPreview | null>(null);
  const [active, setActive] = useState<PlaygroundRun | null>(null);
  const [history, setHistory] = useState<PlaygroundRun[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const experiences = useMemo(() => {
    const items = form.experienceConfig?.items ?? {};
    return Object.keys(items).filter((slug) => items[slug]?.enabled !== false);
  }, [form.experienceConfig]);

  const applyCatalog = useCallback(
    (next: { styles: Slim[]; occasions: Slim[]; voices: Slim[]; writer: string }, sid?: string, oid?: string, vid?: string) => {
      const st = next.styles.find((s) => s.id === sid) ?? next.styles[0];
      const oc = next.occasions.find((o) => o.id === oid) ?? next.occasions[0];
      const vo = next.voices.find((v) => v.id === vid) ?? next.voices[0];
      setStyleId(st?.id ?? '');
      setOccasionId(oc?.id ?? '');
      setVoiceId(vo?.id ?? '');
      setSunoStyle(st?.sunoPrompt ?? '');
      setSunoOccasion(oc?.sunoPrompt ?? '');
      setLyriaStyle(st?.googlePrompt ?? '');
      setLyriaOccasion(oc?.googlePrompt ?? oc?.nm ?? '');
      setStyleWeight(st?.styleWeight != null ? String(st.styleWeight) : '');
      setWeirdness(st?.weirdnessConstraint != null ? String(st.weirdnessConstraint) : '');
      setNegativeTags(st?.negativeTags ?? '');
      const gender = vo?.gender ?? (vo?.id === 'female' ? 'f' : vo?.id === 'male' ? 'm' : '');
      setVocalGender(gender);
      const persona =
        (gender === 'f' ? st?.sunoPersonaIdFemale : gender === 'm' ? st?.sunoPersonaIdMale : '') ||
        vo?.sunoPersonaId ||
        '';
      setPersonaId(persona);
      if (next.writer) setWriterSystem(next.writer);
    },
    [],
  );

  useEffect(() => {
    PlaygroundApi.meta()
      .then((m) => {
        setMeta(m);
        setOpenaiModel((prev) => prev || m.openaiModel);
        setSunoModel((prev) => prev || m.sunoModel);
        setLyriaModel((prev) => prev || m.lyriaModel);
        setWriterSystem((prev) => prev || m.defaultTemplates.writerSystem);
        setWriterUser((prev) => prev || m.defaultTemplates.writerUser);
        setCriticSystem((prev) => prev || m.defaultTemplates.criticSystem);
        setCriticUser((prev) => prev || m.defaultTemplates.criticUser);
      })
      .catch((err) => toast({ variant: 'destructive', title: 'Meta playground', description: (err as Error).message }));
    PlaygroundApi.runs()
      .then((r) => setHistory(r.items))
      .catch(() => undefined);
  }, [toast]);

  useEffect(() => {
    applyCatalog(catalog, styleId, occasionId, voiceId);
    // doar la schimbarea catalogului (site / interfață), nu la fiecare edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id, experienceSlug]);

  function body(): PlaygroundRequest {
    const num = (v: string) => {
      if (!v.trim()) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    return {
      engine,
      experienceSlug: experienceSlug || undefined,
      styleId: styleId || undefined,
      occasionId: occasionId || undefined,
      voiceId: voiceId || undefined,
      recipientName: recipient,
      senderName: sender,
      message,
      tipAmount: num(tipAmount),
      lyricsMode,
      lyrics: lyrics || undefined,
      skipCritic: skipCritic || lyricsMode === 'writer_only',
      phonetic,
      openaiModel: openaiModel || undefined,
      writerSystemPrompt: writerSystem,
      writerUserTemplate: writerUser,
      criticSystemPrompt: criticSystem,
      criticUserTemplate: criticUser,
      languageOverride: languageOverride || undefined,
      locale,
      sunoModel: sunoModel || undefined,
      sunoCustomMode: lyricsMode === 'instrumental' ? false : sunoCustomMode,
      sunoBasePrompt: sunoBase,
      sunoStylePrompt: sunoStyle,
      sunoOccasionPrompt: sunoOccasion,
      sunoPromptOverride: sunoRaw || undefined,
      sunoTitle: sunoTitle || undefined,
      vocalGender: vocalGender || undefined,
      styleWeight: num(styleWeight),
      weirdnessConstraint: num(weirdness),
      negativeTags: negativeTags || undefined,
      personaId: personaId || undefined,
      personaModel,
      instrumental: instrumental || lyricsMode === 'instrumental',
      durationSec: num(durationSec),
      lyriaModel: lyriaModel || undefined,
      lyriaStylePrompt: lyriaStyle,
      lyriaOccasionPrompt: lyriaOccasion,
      lyriaPromptOverride: lyriaRaw || undefined,
    };
  }

  async function runPreview() {
    try {
      const p = await PlaygroundApi.preview(body());
      setPreview(p);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Preview eșuat', description: (err as Error).message });
    }
  }

  async function generateLyrics() {
    setBusyLyrics(true);
    try {
      const res = await PlaygroundApi.lyrics(body());
      setLyricsDraft(res.draft);
      setLyrics(res.final);
      toast({ title: 'Versuri gata', description: res.notes === 'writer_only' ? 'Doar writer, fără critic.' : undefined });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Versurile au eșuat', description: (err as Error).message });
    } finally {
      setBusyLyrics(false);
    }
  }

  function startPolling(id: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const run = await PlaygroundApi.run(id);
        setActive(run);
        setHistory((prev) => [run, ...prev.filter((r) => r.id !== run.id)].slice(0, 30));
        if (run.status === 'succeeded' || run.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setBusyGenerate(false);
          if (run.status === 'succeeded' && run.lyrics) setLyrics(run.lyrics);
          if (run.status === 'failed') {
            toast({ variant: 'destructive', title: 'Generarea a eșuat', description: run.errorMessage ?? '' });
          }
        }
      } catch {
        /* ignore transient */
      }
    }, 4000);
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function generateAudio() {
    const costHint =
      engine === 'suno'
        ? 'Consumă credite Suno reale (~10 / request, 2 piese).'
        : 'Apelează Gemini Lyria (2 variante în paralel, câteva minute).';
    const ok = await confirmDialog({
      title: engine === 'suno' ? 'Generezi pe Suno?' : 'Generezi pe Google Lyria?',
      description: `${costHint} Nu se creează o comandă de client.`,
      confirmText: 'Generează',
    });
    if (!ok) return;
    setBusyGenerate(true);
    try {
      const run = await PlaygroundApi.generate(body());
      setActive(run);
      setHistory((prev) => [run, ...prev.filter((r) => r.id !== run.id)]);
      startPolling(run.id);
    } catch (err) {
      setBusyGenerate(false);
      toast({ variant: 'destructive', title: 'Nu am putut porni generarea', description: (err as Error).message });
    }
  }

  const pending = active?.status === 'queued' || active?.status === 'writing_lyrics' || active?.status === 'generating_audio';

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] items-start">
      <div className="grid gap-6 min-w-0">
        <StudioSection
          title="Playground"
          help="Generezi versuri și audio pe site-ul ăsta, cu prompturile din catalog sau complet custom. Fără comandă, fără email, fără plată."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <EngineCard
              active={engine === 'suno'}
              title="Suno"
              body="Custom mode (versuri literal) sau description. 2 piese / request."
              onClick={() => setEngine('suno')}
            />
            <EngineCard
              active={engine === 'google'}
              title="Google Lyria"
              body="Prompt în limbaj natural. 2 variante în paralel."
              onClick={() => setEngine('google')}
            />
          </div>
        </StudioSection>

        <Card>
          <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Catalog" description="Librăria site-ului sau catalogul unei interfețe.">
              <select
                value={experienceSlug}
                onChange={(e) => setExperienceSlug(e.target.value)}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
              >
                <option value="">Librărie (tenant)</option>
                {experiences.map((slug) => (
                  <option key={slug} value={slug}>
                    Interfață {humanExperienceLabel(slug)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Limbă versuri">
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
              >
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {LOCALE_LABELS[l] ?? l} ({l})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Stil" description={catalog.styles.length ? undefined : 'Librăria e goală — scrie promptul de stil mai jos.'}>
              <select
                value={styleId}
                onChange={(e) => {
                  const id = e.target.value;
                  setStyleId(id);
                  applyCatalog(catalog, id, occasionId, voiceId);
                }}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
              >
                {catalog.styles.length === 0 && <option value="">(niciun stil în catalog)</option>}
                {catalog.styles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nm}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ocazie" description={catalog.occasions.length ? undefined : 'Nicio ocazie în catalog — poți scrie promptul ocaziei manual.'}>
              <select
                value={occasionId}
                onChange={(e) => {
                  const id = e.target.value;
                  setOccasionId(id);
                  applyCatalog(catalog, styleId, id, voiceId);
                }}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
              >
                {catalog.occasions.length === 0 && <option value="">(nicio ocazie în catalog)</option>}
                {catalog.occasions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nm}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Voce">
              <select
                value={voiceId}
                onChange={(e) => {
                  const id = e.target.value;
                  setVoiceId(id);
                  applyCatalog(catalog, styleId, occasionId, id);
                }}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
              >
                {catalog.voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nm}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Durată (sec, Lyria)">
              <Input value={durationSec} onChange={(e) => setDurationSec(e.target.value)} />
            </Field>
            <Field label="Destinatar">
              <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} />
            </Field>
            <Field label="Expeditor">
              <Input value={sender} onChange={(e) => setSender(e.target.value)} />
            </Field>
            <Field label="Mesaj" description="Brief pentru writer. Nu pune versuri finite aici.">
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
            </Field>
            <Field label="Sumă dedicație">
              <Input value={tipAmount} onChange={(e) => setTipAmount(e.target.value)} placeholder="opțional" />
            </Field>
          </CardContent>
        </Card>

        <StudioSection title="Versuri" help="Writer + critic GPT, sau lipești tu. Instrumental sare peste voce.">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['generate', 'Writer + critic'],
                    ['writer_only', 'Doar writer'],
                    ['custom', 'Lipesc eu'],
                    ['instrumental', 'Instrumental'],
                  ] as Array<[PlaygroundLyricsMode, string]>
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setLyricsMode(id);
                      if (id === 'writer_only') setSkipCritic(true);
                      if (id === 'generate') setSkipCritic(false);
                      if (id === 'instrumental') setInstrumental(true);
                      else setInstrumental(false);
                    }}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs',
                      lyricsMode === id
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border text-muted-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Model OpenAI">
                  <ModelSelect
                    value={openaiModel}
                    options={meta?.openaiModels ?? []}
                    onChange={setOpenaiModel}
                    placeholder={meta?.openaiModel}
                  />
                </Field>
                <Field label="Limbă forțată (opțional)" description="Ex. ucraineană. Gol = limba de mai sus.">
                  <Input value={languageOverride} onChange={(e) => setLanguageOverride(e.target.value)} />
                </Field>
              </div>
              <Toggle
                label="Rescriere fonetică (doar Suno)"
                description="Versurile afișate rămân curate; Suno primește varianta „cum se aud”."
                value={phonetic}
                onChange={setPhonetic}
              />
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setShowGpt((v) => !v)}
              >
                {showGpt ? 'Ascunde prompturile GPT' : 'Editează prompturile GPT (writer / critic)'}
              </button>
              {showGpt && (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setWriterSystem(catalog.writer || meta?.defaultTemplates.writerSystem || '');
                        setWriterUser(form.suno?.writerUserTemplate || meta?.defaultTemplates.writerUser || '');
                        setCriticSystem(form.suno?.criticSystemPrompt || meta?.defaultTemplates.criticSystem || '');
                        setCriticUser(form.suno?.criticUserTemplate || meta?.defaultTemplates.criticUser || '');
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reia din site
                    </Button>
                  </div>
                  <Field label="Writer — system">
                    <Textarea value={writerSystem} onChange={(e) => setWriterSystem(e.target.value)} rows={6} className="font-mono text-xs" />
                  </Field>
                  <Field label="Writer — user template" description="Placeholders: {{style}} {{occasion}} {{recipientName}} {{senderName}} {{message}} {{tipAmount}} {{currency}} {{voiceArtist}} {{styleHint}}">
                    <Textarea value={writerUser} onChange={(e) => setWriterUser(e.target.value)} rows={8} className="font-mono text-xs" />
                  </Field>
                  <Field label="Critic — system">
                    <Textarea value={criticSystem} onChange={(e) => setCriticSystem(e.target.value)} rows={5} className="font-mono text-xs" />
                  </Field>
                  <Field label="Critic — user template" description="Plus {{draft}}.">
                    <Textarea value={criticUser} onChange={(e) => setCriticUser(e.target.value)} rows={7} className="font-mono text-xs" />
                  </Field>
                </div>
              )}
              <Field label="Versuri">
                <Textarea
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  rows={12}
                  placeholder="[Verse 1]…"
                  className="font-mono text-xs"
                />
              </Field>
              {lyricsDraft && lyricsDraft !== lyrics && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Draft writer (înainte de critic)</summary>
                  <pre className="mt-2 whitespace-pre-wrap font-mono bg-secondary/40 rounded-md p-2">{lyricsDraft}</pre>
                </details>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void generateLyrics()} disabled={busyLyrics || lyricsMode === 'instrumental'}>
                  {busyLyrics ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {busyLyrics ? 'Se scriu versurile…' : 'Generează versuri'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </StudioSection>

        {engine === 'suno' ? (
          <StudioSection title="Suno" help="Promptul de stil e preluat din catalog. Îl poți rescrie. Prompt brut = body.prompt trimis ca atare.">
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Model">
                    <ModelSelect value={sunoModel} options={meta?.sunoModels ?? []} onChange={setSunoModel} placeholder={meta?.sunoModel} />
                  </Field>
                  <Field label="Titlu piesă">
                    <Input value={sunoTitle} onChange={(e) => setSunoTitle(e.target.value)} placeholder="Pentru Mirela, de la Costel" />
                  </Field>
                </div>
                <Toggle
                  label="Custom mode (versuri literal)"
                  description="ON: prompt = versurile. OFF: Suno își scrie versurile din descriere (limita ~500)."
                  value={sunoCustomMode && lyricsMode !== 'instrumental'}
                  onChange={setSunoCustomMode}
                />
                <Field label="Prompt de stil (tag-uri)">
                  <Textarea value={sunoStyle} onChange={(e) => setSunoStyle(e.target.value)} rows={4} className="font-mono text-xs" />
                </Field>
                <Field label="Prompt ocazie (lipit la stil)">
                  <Textarea value={sunoOccasion} onChange={(e) => setSunoOccasion(e.target.value)} rows={2} className="font-mono text-xs" />
                </Field>
                <Field label="Prompt de bază (folosit doar dacă stilul e gol)">
                  <Textarea value={sunoBase} onChange={(e) => setSunoBase(e.target.value)} rows={3} className="font-mono text-xs" />
                </Field>
                <Field label="Prompt brut (opțional)" description="Dacă e completat, înlocuiește versurile / descrierea. Style-ul de mai sus rămâne.">
                  <Textarea value={sunoRaw} onChange={(e) => setSunoRaw(e.target.value)} rows={5} className="font-mono text-xs" placeholder="lasă gol = versurile din caseta de mai sus" />
                </Field>
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowAudioAdvanced((v) => !v)}>
                  {showAudioAdvanced ? 'Ascunde opțiuni avansate' : 'Opțiuni avansate (voce, persona, weight)'}
                </button>
                {showAudioAdvanced && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Gen vocal">
                      <select
                        value={vocalGender}
                        onChange={(e) => setVocalGender(e.target.value as 'm' | 'f' | '')}
                        className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                      >
                        <option value="">auto</option>
                        <option value="m">masculin</option>
                        <option value="f">feminin</option>
                      </select>
                    </Field>
                    <Field label="Persona ID">
                      <Input value={personaId} onChange={(e) => setPersonaId(e.target.value)} />
                    </Field>
                    <Field label="Tip persona">
                      <select
                        value={personaModel}
                        onChange={(e) => setPersonaModel(e.target.value as 'style_persona' | 'voice_persona')}
                        className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                      >
                        <option value="style_persona">style_persona</option>
                        <option value="voice_persona">voice_persona (V5+)</option>
                      </select>
                    </Field>
                    <Field label="styleWeight (0–1)">
                      <Input value={styleWeight} onChange={(e) => setStyleWeight(e.target.value)} />
                    </Field>
                    <Field label="weirdness (0–1)">
                      <Input value={weirdness} onChange={(e) => setWeirdness(e.target.value)} />
                    </Field>
                    <Field label="negativeTags">
                      <Input value={negativeTags} onChange={(e) => setNegativeTags(e.target.value)} />
                    </Field>
                  </div>
                )}
              </CardContent>
            </Card>
          </StudioSection>
        ) : (
          <StudioSection title="Google Lyria" help="Prompt natural-language. Brut = tot `input`-ul către Interactions API.">
            <Card>
              <CardContent className="p-4 space-y-3">
                <Field label="Model">
                  <ModelSelect value={lyriaModel} options={meta?.lyriaModels ?? []} onChange={setLyriaModel} placeholder={meta?.lyriaModel} />
                </Field>
                <Field label="Prompt de stil">
                  <Textarea value={lyriaStyle} onChange={(e) => setLyriaStyle(e.target.value)} rows={4} className="font-mono text-xs" />
                </Field>
                <Field label="Prompt ocazie">
                  <Textarea value={lyriaOccasion} onChange={(e) => setLyriaOccasion(e.target.value)} rows={2} className="font-mono text-xs" />
                </Field>
                <Field label="Prompt complet personalizat" description="Dacă e completat, înlocuiește tot ce construiește API-ul (stil + voce + versuri).">
                  <Textarea value={lyriaRaw} onChange={(e) => setLyriaRaw(e.target.value)} rows={8} className="font-mono text-xs" placeholder="lasă gol = promptul asamblat automat" />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Gen vocal">
                    <select
                      value={vocalGender}
                      onChange={(e) => setVocalGender(e.target.value as 'm' | 'f' | '')}
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">auto</option>
                      <option value="m">masculin</option>
                      <option value="f">feminin</option>
                    </select>
                  </Field>
                  <Toggle label="Instrumental" value={instrumental} onChange={setInstrumental} />
                </div>
              </CardContent>
            </Card>
          </StudioSection>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void runPreview()}>
            Preview prompturi
          </Button>
          <Button type="button" onClick={() => void generateAudio()} disabled={busyGenerate || pending}>
            {busyGenerate || pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            {pending ? statusLabel(active!.status) : 'Generează melodia'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 min-w-0 lg:sticky lg:top-16">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">Rezultat</div>
              {active && (
                <Badge variant={active.status === 'succeeded' ? 'success' : active.status === 'failed' ? 'destructive' : 'warning'}>
                  {statusLabel(active.status)}
                </Badge>
              )}
            </div>
            {active?.errorMessage && <p className="text-sm text-destructive">{active.errorMessage}</p>}
            {active?.tracks?.length ? (
              <div className="space-y-2">
                {active.tracks.map((t, i) => (
                  <div key={`${t.audioUrl}-${i}`} className="space-y-1">
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Volume2 className="h-3 w-3" />
                      Varianta {i + 1}
                      {t.durationSec ? ` · ${t.durationSec}s` : ''}
                    </div>
                    <audio controls src={absUrl(t.audioUrl)} className="w-full h-8" preload="metadata" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {pending ? 'Aștept audio-ul — Suno/Lyria durează 2–8 minute.' : 'Nicio generare încă.'}
              </p>
            )}
            {active?.lyrics && (
              <details open>
                <summary className="text-xs cursor-pointer">Versuri livrate</summary>
                <pre className="mt-2 whitespace-pre-wrap font-mono text-xs bg-secondary/40 rounded-md p-2 max-h-64 overflow-auto">
                  {active.lyrics}
                </pre>
              </details>
            )}
            {active?.providerJobId && (
              <div className="text-[11px] text-muted-foreground font-mono break-all">job {active.providerJobId}</div>
            )}
          </CardContent>
        </Card>

        {preview && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="text-sm font-semibold">Ce s-ar trimite</div>
              {engine === 'suno' ? (
                <>
                  <PreviewBlock title="Suno style" text={preview.suno.style || '(default intern + basePrompt)'} />
                  <PreviewBlock title="Suno prompt" text={preview.suno.prompt || '(gol)'} />
                </>
              ) : (
                <PreviewBlock title="Lyria prompt" text={preview.lyria.prompt} />
              )}
              <PreviewBlock title="Writer system" text={preview.gpt.writerSystem} />
              <PreviewBlock title="Writer user" text={preview.gpt.writerUser} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="text-sm font-semibold">Istoric pe site</div>
            {history.length === 0 && <p className="text-sm text-muted-foreground">Nicio rulare.</p>}
            <ul className="grid gap-1.5">
              {history.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="w-full text-left rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary/50"
                    onClick={() => {
                      setActive(r);
                      if (r.lyrics) setLyrics(r.lyrics);
                    }}
                  >
                    <span className="font-medium">{r.engine === 'google' ? 'Lyria' : 'Suno'}</span>
                    {' · '}
                    {statusLabel(r.status)}
                    {' · '}
                    {new Date(r.createdAt).toLocaleString('ro-RO')}
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EngineCard({
  active,
  title,
  body,
  onClick,
}: {
  active: boolean;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border px-4 py-3 text-left transition-colors',
        active ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/40' : 'border-border hover:border-primary/30',
      )}
    >
      <div className="text-sm font-medium">{title}</div>
      <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{body}</p>
    </button>
  );
}

function ModelSelect({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const extra = value && !options.includes(value);
  return (
    <div className="space-y-1">
      <select
        value={extra ? '__custom__' : value}
        onChange={(e) => {
          if (e.target.value === '__custom__') return;
          onChange(e.target.value);
        }}
        className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
      >
        {!value && placeholder && <option value="">{placeholder} (default)</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {extra && <option value="__custom__">{value}</option>}
      </select>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="sau scrie un model" className="h-8 text-xs" />
    </div>
  );
}

function PreviewBlock({ title, text }: { title: string; text: string }) {
  return (
    <details>
      <summary className="text-[11px] cursor-pointer text-muted-foreground">{title}</summary>
      <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] bg-secondary/40 rounded-md p-2 max-h-48 overflow-auto">
        {text}
      </pre>
    </details>
  );
}
