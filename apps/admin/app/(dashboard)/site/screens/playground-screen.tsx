'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RotateCcw, Sparkles, Volume2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/cn';
import { LOCALES, LOCALE_LABELS } from '../studio-constants';
import { humanExperienceLabel } from '../interfaces/config';

function absUrl(rel: string): string {
  if (!rel || rel.startsWith('http')) return rel;
  const base = process.env.NEXT_PUBLIC_API_URL ?? '';
  return `${base}${rel}`;
}

type Slim = {
  id: string;
  nm: string;
  sunoPrompt?: string;
  googlePrompt?: string;
  gender?: 'm' | 'f';
  sunoPersonaId?: string;
  lyricsHint?: string;
  styleWeight?: number;
  weirdnessConstraint?: number;
  negativeTags?: string;
  sunoPersonaIdMale?: string;
  sunoPersonaIdFemale?: string;
};

function catalogOf(form: SiteDto, slug: string) {
  const cat = slug ? form.experienceConfig?.items?.[slug]?.catalog : undefined;
  const stylesOwn = Array.isArray(cat?.styles);
  const occasionsOwn = Array.isArray(cat?.occasions);
  const voicesOwn = Array.isArray(cat?.voices);
  return {
    slug,
    styles: (stylesOwn ? cat?.styles ?? [] : form.styles ?? []) as Slim[],
    occasions: (occasionsOwn ? cat?.occasions ?? [] : form.occasions ?? []) as Slim[],
    voices: (voicesOwn ? cat?.voices ?? [] : form.voices ?? []) as Slim[],
    writer: cat?.writerSystemPrompt?.trim() || form.suno?.writerSystemPrompt || '',
    inherited: {
      styles: !!slug && !cat?.styles?.length,
      occasions: !!slug && !cat?.occasions?.length,
      voices: !!slug && !cat?.voices?.length,
    },
  };
}

function statusLabel(s: PlaygroundRun['status']): string {
  if (s === 'queued') return 'În coadă';
  if (s === 'writing_lyrics') return 'Scrie versuri…';
  if (s === 'generating_audio') return 'Generează audio…';
  if (s === 'succeeded') return 'Gata';
  return 'Eșuat';
}

function isGpt5(model: string): boolean {
  const m = model.trim().toLowerCase();
  return m.startsWith('gpt-5') || /^o[1-9]/.test(m);
}

export function PlaygroundScreen({ form }: { form: SiteDto }) {
  const { toast } = useToast();
  const [meta, setMeta] = useState<PlaygroundMeta | null>(null);
  const [engine, setEngine] = useState<PlaygroundEngine>(form.musicEngine === 'google' ? 'google' : 'suno');
  const [experienceSlug, setExperienceSlug] = useState('');
  const catalog = useMemo(() => catalogOf(form, experienceSlug), [form, experienceSlug]);

  const [styleId, setStyleId] = useState('');
  const [occasionId, setOccasionId] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [recipient, setRecipient] = useState('Mirela');
  const [sender, setSender] = useState('Costel');
  const [message, setMessage] = useState('La mulți ani cu sănătate');
  const [tipAmount, setTipAmount] = useState('');
  const [durationSec, setDurationSec] = useState('120');
  const [lyricsMode, setLyricsMode] = useState<PlaygroundLyricsMode>('custom');
  const [lyrics, setLyrics] = useState('');
  const [lyricsDraft, setLyricsDraft] = useState('');
  const [phonetic, setPhonetic] = useState(false);
  const [skipCritic, setSkipCritic] = useState(false);
  const [openaiModel, setOpenaiModel] = useState('');
  const [openaiTemperature, setOpenaiTemperature] = useState('0.85');
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
  const [vocalGender, setVocalGender] = useState<'m' | 'f' | ''>('m');
  const [styleWeight, setStyleWeight] = useState('0.65');
  const [weirdness, setWeirdness] = useState('0.30');
  const [negativeTags, setNegativeTags] = useState('pop, EDM, trap-rap');
  const [personaId, setPersonaId] = useState('');
  const [personaModel, setPersonaModel] = useState<'style_persona' | 'voice_persona'>('style_persona');
  const [instrumental, setInstrumental] = useState(false);
  const [lyriaModel, setLyriaModel] = useState('');
  const [lyriaStyle, setLyriaStyle] = useState('');
  const [lyriaOccasion, setLyriaOccasion] = useState('');
  const [lyriaRaw, setLyriaRaw] = useState('');
  const [formKind, setFormKind] = useState<'full' | 'fields'>('full');
  const [variantCount, setVariantCount] = useState<1 | 2>(1);
  const [showGpt, setShowGpt] = useState(false);
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

  const fillFromEntries = useCallback((st?: Slim, oc?: Slim, vo?: Slim, writer?: string) => {
    setStyleId(st?.id ?? '');
    setOccasionId(oc?.id ?? '');
    setVoiceId(vo?.id ?? '');
    setSunoStyle(st?.sunoPrompt ?? '');
    setSunoOccasion(oc?.sunoPrompt ?? '');
    setLyriaStyle(st?.googlePrompt ?? '');
    setLyriaOccasion(oc?.googlePrompt ?? oc?.nm ?? '');
    if (st?.styleWeight != null) setStyleWeight(String(st.styleWeight));
    if (st?.weirdnessConstraint != null) setWeirdness(String(st.weirdnessConstraint));
    if (st?.negativeTags) setNegativeTags(st.negativeTags);
    const gender = vo?.gender ?? (vo?.id === 'female' ? 'f' : vo?.id === 'male' ? 'm' : '');
    if (gender) setVocalGender(gender);
    const persona =
      (gender === 'f' ? st?.sunoPersonaIdFemale : gender === 'm' ? st?.sunoPersonaIdMale : '') ||
      vo?.sunoPersonaId ||
      '';
    setPersonaId(persona);
    if (writer) setWriterSystem(writer);
  }, []);

  const loadSource = useCallback(
    (slug: string) => {
      setExperienceSlug(slug);
      const next = catalogOf(form, slug);
      fillFromEntries(next.styles[0], next.occasions[0], next.voices[0], next.writer);
    },
    [form, fillFromEntries],
  );

  useEffect(() => {
    const id = 'pg-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap';
    document.head.appendChild(link);
  }, []);

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
    const next = catalogOf(form, '');
    fillFromEntries(next.styles[0], next.occasions[0], next.voices[0], next.writer);
    // o dată la mount / schimbarea site-ului
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id]);

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
      lyricsMode: formKind === 'full' ? 'custom' : lyricsMode,
      lyrics: formKind === 'full' ? undefined : lyrics || undefined,
      skipCritic: skipCritic || lyricsMode === 'writer_only',
      phonetic,
      openaiModel: openaiModel || undefined,
      openaiTemperature: num(openaiTemperature),
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
      sunoPromptOverride: formKind === 'full' ? sunoRaw || undefined : undefined,
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
      lyriaPromptOverride: formKind === 'full' ? lyriaRaw || undefined : undefined,
      variantCount: engine === 'google' ? variantCount : undefined,
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
      const res = await PlaygroundApi.lyrics({ ...body(), lyricsMode: skipCritic ? 'writer_only' : 'generate' });
      setLyricsDraft(res.draft);
      setLyrics(res.final);
      setLyricsMode('custom');
      toast({ title: 'Versuri gata' });
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
        /* ignore */
      }
    }, 4000);
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function generateAudio() {
    if (formKind === 'full') {
      const raw = engine === 'google' ? lyriaRaw : sunoRaw;
      if (!raw.trim()) {
        toast({ variant: 'destructive', title: 'Promptul complet e gol' });
        return;
      }
    }
    const costHint =
      engine === 'suno'
        ? 'Consumă credite Suno reale (~10 / request, 2 piese).'
        : variantCount === 2
          ? 'Apelează Gemini Lyria de 2 ori (~0,16 USD pe plan plătit). Lyria n-are plan gratuit.'
          : 'Apelează Gemini Lyria o dată (~0,08 USD pe plan plătit). Lyria n-are plan gratuit.';
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
  const modelOptions = meta?.openaiModelOptions?.length
    ? meta.openaiModelOptions
    : (meta?.openaiModels ?? []).map((id) => ({ id, label: id, group: 'Modele' }));
  const groups = [...new Set(modelOptions.map((m) => m.group))];

  return (
    <div
      className="pg -mx-4 md:-mx-6 -mb-6 px-4 md:px-6 pb-8"
      style={{ fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif" }}
    >
      <header className="flex flex-wrap items-end justify-between gap-3 mb-5 pt-1">
        <div>
          <div className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground">Consolă de test</div>
          <h2
            className="text-[28px] leading-none mt-1"
            style={{ fontFamily: 'Fraunces, Georgia, serif', fontOpticalSizing: 'auto' }}
          >
            Studio
          </h2>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-xl">
            Două formulare separate: promptul complet înlocuiește tot, inclusiv GPT. Câmpurile sunt pentru catalog + versuri.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-border p-0.5 bg-card">
            {(['suno', 'google'] as const).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEngine(e)}
                className={cn(
                  'px-4 py-1.5 text-xs font-medium rounded-full transition-colors',
                  engine === e ? 'bg-[#d4a84b] text-[#1a1408]' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {e === 'suno' ? 'Suno' : 'Google Lyria'}
              </button>
            ))}
          </div>
          <div className="flex rounded-full border border-border p-0.5 bg-card">
            {(
              [
                ['full', 'Prompt complet'],
                ['fields', 'Câmpuri + GPT'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFormKind(id)}
                className={cn(
                  'px-4 py-1.5 text-xs font-medium rounded-full transition-colors',
                  formKind === id ? 'bg-[#efe6d0] text-[#1a1410]' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {formKind === 'fields' && (
      <section className="rounded-2xl border border-border bg-[#121018] p-3 md:p-4 mb-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground">Sursă — încarcă din catalog</div>
          <span className="text-[11px] text-muted-foreground">
            {catalog.styles.length} stiluri
            {catalog.inherited.styles ? ' (moștenite)' : ''}
            {' · '}
            {catalog.occasions.length} ocazii
            {catalog.inherited.occasions ? ' (moștenite)' : ''}
            {' · '}
            {catalog.voices.length} voci
            {catalog.inherited.voices ? ' (moștenite)' : ''}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
          <select
            value={experienceSlug}
            onChange={(e) => loadSource(e.target.value)}
            className="h-9 rounded-lg border border-border bg-[#1c1924] px-3 text-sm"
          >
            <option value="">Librărie (tenant)</option>
            {experiences.map((slug) => (
              <option key={slug} value={slug}>
                Interfață {humanExperienceLabel(slug)}
              </option>
            ))}
          </select>
          <select
            key={`oc-${experienceSlug}`}
            value={occasionId}
            onChange={(e) => {
              const id = e.target.value;
              const oc = catalog.occasions.find((o) => o.id === id);
              setOccasionId(id);
              setSunoOccasion(oc?.sunoPrompt ?? '');
              setLyriaOccasion(oc?.googlePrompt ?? oc?.nm ?? '');
            }}
            className="h-9 rounded-lg border border-border bg-[#1c1924] px-3 text-sm"
          >
            {catalog.occasions.length === 0 && <option value="">Fără ocazii în sursă</option>}
            {catalog.occasions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nm}
              </option>
            ))}
          </select>
          <select
            key={`vo-${experienceSlug}`}
            value={voiceId}
            onChange={(e) => {
              const id = e.target.value;
              const vo = catalog.voices.find((v) => v.id === id);
              const st = catalog.styles.find((s) => s.id === styleId);
              setVoiceId(id);
              const gender = vo?.gender ?? (vo?.id === 'female' ? 'f' : vo?.id === 'male' ? 'm' : '');
              if (gender) setVocalGender(gender);
              setPersonaId(
                (gender === 'f' ? st?.sunoPersonaIdFemale : gender === 'm' ? st?.sunoPersonaIdMale : '') ||
                  vo?.sunoPersonaId ||
                  '',
              );
            }}
            className="h-9 rounded-lg border border-border bg-[#1c1924] px-3 text-sm"
          >
            {catalog.voices.length === 0 && <option value="">Fără voci în sursă</option>}
            {catalog.voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nm}
              </option>
            ))}
          </select>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            className="h-9 rounded-lg border border-border bg-[#1c1924] px-3 text-sm"
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_LABELS[l] ?? l}
              </option>
            ))}
          </select>
        </div>
        {experienceSlug && (catalog.inherited.styles || catalog.inherited.occasions) && (
          <p className="text-[11px] text-amber-400/90 mb-2">
            Interfața {humanExperienceLabel(experienceSlug)} n-are catalog propriu — vezi librăria tenantului.
            Ca să testezi prompturi separate, pune-le la Interfețe → Catalog.
          </p>
        )}
        <div key={`st-${experienceSlug}`} className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5">
          {catalog.styles.length === 0 && (
            <span className="text-xs text-muted-foreground py-1.5">
              {experienceSlug
                ? `Interfața ${humanExperienceLabel(experienceSlug)} n-are stiluri proprii — scrie promptul jos.`
                : 'Librăria e goală — scrie promptul de stil jos.'}
            </span>
          )}
          {catalog.styles.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                const oc = catalog.occasions.find((o) => o.id === occasionId) ?? catalog.occasions[0];
                const vo = catalog.voices.find((v) => v.id === voiceId) ?? catalog.voices[0];
                fillFromEntries(s, oc, vo, catalog.writer);
              }}
              className={cn(
                'shrink-0 rounded-full px-3 py-1 text-xs border transition-colors',
                styleId === s.id
                  ? 'border-[#d4a84b] bg-[#d4a84b]/15 text-[#f3e6c0]'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {s.nm}
            </button>
          ))}
        </div>
      </section>
      )}

      <div
        className={cn(
          'grid gap-5 items-start',
          formKind === 'fields'
            ? 'xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.85fr)_minmax(280px,0.7fr)]'
            : 'xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.7fr)]',
        )}
      >
        {formKind === 'fields' && (
        <div
          className="rounded-2xl p-5 md:p-6 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.7)]"
          style={{ background: '#efe6d0', color: '#1a1410' }}
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <div style={{ fontFamily: 'Fraunces, Georgia, serif' }} className="text-lg">
              Versuri
            </div>
            <div className="flex gap-1">
              {(
                [
                  ['custom', 'Le scriu'],
                  ['generate', 'GPT'],
                  ['instrumental', 'Fără voce'],
                ] as Array<[PlaygroundLyricsMode, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setLyricsMode(id);
                    setInstrumental(id === 'instrumental');
                    setSkipCritic(false);
                    if (id === 'instrumental') setSunoCustomMode(false);
                    else setSunoCustomMode(true);
                  }}
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-[11px] border',
                    lyricsMode === id ? 'border-[#1a1410] bg-[#1a1410] text-[#efe6d0]' : 'border-[#1a1410]/25',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={lyrics}
            onChange={(e) => {
              setLyrics(e.target.value);
              if (e.target.value.trim()) setLyricsMode('custom');
            }}
            rows={16}
            placeholder={'[Verse 1]\nDe la Costel, pentru Mirela, cu drag\n[Chorus]\nMirela, Mirela…'}
            className="w-full resize-y rounded-lg border-0 bg-[#f7f1e2] px-3 py-2 text-[13px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#d4a84b]"
            style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", color: '#1a1410' }}
          />
          {lyricsDraft && lyricsDraft !== lyrics && (
            <details className="mt-2 text-[11px] opacity-70">
              <summary className="cursor-pointer">Draft writer</summary>
              <pre className="mt-1 whitespace-pre-wrap">{lyricsDraft}</pre>
            </details>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <label className="text-[11px] opacity-70 col-span-2 sm:col-span-1">
              Destinatar
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="mt-1 w-full h-8 rounded-md border border-[#1a1410]/15 bg-white/50 px-2 text-sm"
              />
            </label>
            <label className="text-[11px] opacity-70 col-span-2 sm:col-span-1">
              Expeditor
              <input
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                className="mt-1 w-full h-8 rounded-md border border-[#1a1410]/15 bg-white/50 px-2 text-sm"
              />
            </label>
            <label className="text-[11px] opacity-70 col-span-2">
              Brief pentru GPT (nu versuri)
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="mt-1 w-full h-8 rounded-md border border-[#1a1410]/15 bg-white/50 px-2 text-sm"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <button
              type="button"
              onClick={() => void generateLyrics()}
              disabled={busyLyrics || lyricsMode === 'instrumental'}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#1a1410] text-[#efe6d0] text-xs font-medium disabled:opacity-50"
            >
              {busyLyrics ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Scrie cu GPT
            </button>
            <label className="flex items-center gap-1.5 text-[11px] opacity-80">
              <input type="checkbox" checked={skipCritic} onChange={(e) => setSkipCritic(e.target.checked)} />
              fără critic
            </label>
            <label className="flex items-center gap-1.5 text-[11px] opacity-80">
              <input type="checkbox" checked={phonetic} onChange={(e) => setPhonetic(e.target.checked)} />
              fonetic Suno
            </label>
          </div>
        </div>
        )}

        <div className="rounded-2xl border border-border bg-[#121018] p-4 space-y-4">
          <div className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
            {formKind === 'full'
              ? engine === 'suno'
                ? 'Prompt complet Suno'
                : 'Prompt complet Lyria'
              : engine === 'suno'
                ? 'Masă Suno'
                : 'Masă Lyria'}
          </div>

          {formKind === 'full' ? (
            engine === 'suno' ? (
              <>
                <KnobField
                  label="Prompt complet (înlocuiește tot)"
                  hint="Trimis ca prompt/versuri către Suno. Nu trece prin GPT și nu se lipește stilul din catalog."
                >
                  <Textarea
                    value={sunoRaw}
                    onChange={(e) => setSunoRaw(e.target.value)}
                    rows={16}
                    className="font-mono text-xs bg-[#1c1924] border-border min-h-[280px] resize-y"
                    placeholder="Versurile + descrierea muzicală, exact cum vrei să plece la Suno."
                  />
                  <CharCount value={sunoRaw} />
                </KnobField>
                <div className="grid grid-cols-2 gap-2">
                  <KnobField label="Model Suno">
                    <select
                      value={sunoModel}
                      onChange={(e) => setSunoModel(e.target.value)}
                      className="h-9 w-full rounded-md border border-border bg-[#1c1924] px-2 text-sm"
                    >
                      {(meta?.sunoModels ?? ['V4_5', 'V5', 'V5_5']).map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </KnobField>
                  <KnobField label="Titlu">
                    <Input value={sunoTitle} onChange={(e) => setSunoTitle(e.target.value)} placeholder="Pentru Mirela" className="h-9 text-sm bg-[#1c1924]" />
                  </KnobField>
                </div>
              </>
            ) : (
              <>
                <KnobField
                  label="Prompt complet (înlocuiește tot)"
                  hint="Trimis ca input la Lyria. Nu trece prin GPT, nu se lipește stilul, ocazia sau versurile din celălalt formular."
                >
                  <Textarea
                    value={lyriaRaw}
                    onChange={(e) => setLyriaRaw(e.target.value)}
                    rows={16}
                    className="font-mono text-xs bg-[#1c1924] border-border min-h-[280px] resize-y"
                    placeholder={'Descrierea muzicală în engleză, apoi:\n\nLyrics:\n\n[Verse 1]\n…'}
                  />
                  <CharCount value={lyriaRaw} />
                </KnobField>
                <div className="grid grid-cols-2 gap-2">
                  <KnobField label="Model">
                    <select
                      value={lyriaModel}
                      onChange={(e) => setLyriaModel(e.target.value)}
                      className="h-9 w-full rounded-md border border-border bg-[#1c1924] px-2 text-sm font-mono"
                    >
                      {lyriaModelChoices(meta?.lyriaModels, lyriaModel).map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </KnobField>
                  <KnobField label="Durată (sec)">
                    <Input value={durationSec} onChange={(e) => setDurationSec(e.target.value)} className="h-9 text-sm bg-[#1c1924]" />
                  </KnobField>
                </div>
                <div className="flex gap-1.5">
                  {([1, 2] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setVariantCount(n)}
                      className={cn(
                        'flex-1 h-9 rounded-lg border text-xs font-medium',
                        variantCount === n
                          ? 'border-[#d4a84b] bg-[#d4a84b]/15 text-[#f3e6c0]'
                          : 'border-border text-muted-foreground',
                      )}
                    >
                      {n === 1 ? '1 piesă' : '2 piese (2× cotă)'}
                    </button>
                  ))}
                </div>
              </>
            )
          ) : (
            <>
          <div className="flex gap-1.5">
            {(['m', 'f'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setVocalGender(g)}
                className={cn(
                  'flex-1 h-11 rounded-xl border text-sm font-medium transition-colors',
                  vocalGender === g
                    ? 'border-[#d4a84b] bg-[#d4a84b]/15 text-[#f3e6c0]'
                    : 'border-border text-muted-foreground',
                )}
              >
                {g === 'm' ? 'Voce masculin' : 'Voce feminin'}
              </button>
            ))}
          </div>

          {engine === 'suno' ? (
            <>
              <KnobField
                label="Prompt de stil Suno"
                hint="Tag-uri. Asta e ce testezi — scrie-l tu sau încarcă-l dintr-un stil."
              >
                <Textarea
                  value={sunoStyle}
                  onChange={(e) => setSunoStyle(e.target.value)}
                  rows={5}
                  className="font-mono text-xs bg-[#1c1924] border-border"
                  placeholder="classic lăutărească manele, accordion, violin, 95 BPM"
                />
              </KnobField>
              <KnobField label="Prompt ocazie (lipit la stil)">
                <Textarea
                  value={sunoOccasion}
                  onChange={(e) => setSunoOccasion(e.target.value)}
                  rows={2}
                  className="font-mono text-xs bg-[#1c1924] border-border"
                />
              </KnobField>
              <KnobField label="Prompt de bază (doar dacă stilul e gol)">
                <Textarea
                  value={sunoBase}
                  onChange={(e) => setSunoBase(e.target.value)}
                  rows={2}
                  className="font-mono text-xs bg-[#1c1924] border-border"
                />
              </KnobField>
              <div className="grid grid-cols-2 gap-3">
                <RangeField label="styleWeight" value={styleWeight} onChange={setStyleWeight} />
                <RangeField label="weirdness" value={weirdness} onChange={setWeirdness} />
              </div>
              <KnobField label="negativeTags">
                <Input value={negativeTags} onChange={(e) => setNegativeTags(e.target.value)} className="h-8 text-xs bg-[#1c1924]" />
              </KnobField>
              <div className="grid grid-cols-2 gap-2">
                <KnobField label="Model Suno">
                  <select
                    value={sunoModel}
                    onChange={(e) => setSunoModel(e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-[#1c1924] px-2 text-sm"
                  >
                    {(meta?.sunoModels ?? ['V4_5', 'V5', 'V5_5']).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </KnobField>
                <KnobField label="Titlu">
                  <Input value={sunoTitle} onChange={(e) => setSunoTitle(e.target.value)} placeholder="Pentru Mirela" className="h-9 text-sm bg-[#1c1924]" />
                </KnobField>
                <KnobField label="Persona ID">
                  <Input value={personaId} onChange={(e) => setPersonaId(e.target.value)} className="h-9 text-xs bg-[#1c1924]" />
                </KnobField>
                <KnobField label="Tip persona">
                  <select
                    value={personaModel}
                    onChange={(e) => setPersonaModel(e.target.value as 'style_persona' | 'voice_persona')}
                    className="h-9 w-full rounded-md border border-border bg-[#1c1924] px-2 text-sm"
                  >
                    <option value="style_persona">style_persona</option>
                    <option value="voice_persona">voice_persona (V5+)</option>
                  </select>
                </KnobField>
              </div>
              <label className="flex items-center justify-between gap-2 text-xs">
                <span>Custom mode — versurile se cântă literal</span>
                <input
                  type="checkbox"
                  checked={sunoCustomMode && lyricsMode !== 'instrumental'}
                  onChange={(e) => setSunoCustomMode(e.target.checked)}
                />
              </label>
            </>
          ) : (
            <>
              <KnobField label="Prompt de stil Lyria" hint="Limbaj natural: gen, instrumente, BPM, mood.">
                <Textarea
                  value={lyriaStyle}
                  onChange={(e) => setLyriaStyle(e.target.value)}
                  rows={5}
                  className="font-mono text-xs bg-[#1c1924] border-border"
                />
              </KnobField>
              <KnobField label="Prompt ocazie">
                <Textarea
                  value={lyriaOccasion}
                  onChange={(e) => setLyriaOccasion(e.target.value)}
                  rows={2}
                  className="font-mono text-xs bg-[#1c1924] border-border"
                />
              </KnobField>
              <div className="grid grid-cols-2 gap-2">
                <KnobField label="Model">
                  <select
                    value={lyriaModel}
                    onChange={(e) => setLyriaModel(e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-[#1c1924] px-2 text-sm font-mono"
                  >
                    {lyriaModelChoices(meta?.lyriaModels, lyriaModel).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </KnobField>
                <KnobField label="Durată (sec)">
                  <Input value={durationSec} onChange={(e) => setDurationSec(e.target.value)} className="h-9 text-sm bg-[#1c1924]" />
                </KnobField>
              </div>
              <div className="flex gap-1.5">
                {([1, 2] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setVariantCount(n)}
                    className={cn(
                      'flex-1 h-9 rounded-lg border text-xs font-medium',
                      variantCount === n
                        ? 'border-[#d4a84b] bg-[#d4a84b]/15 text-[#f3e6c0]'
                        : 'border-border text-muted-foreground',
                    )}
                  >
                    {n === 1 ? '1 piesă' : '2 piese (2× cotă)'}
                  </button>
                ))}
              </div>
              <label className="flex items-center justify-between gap-2 text-xs">
                <span>Instrumental</span>
                <input type="checkbox" checked={instrumental} onChange={(e) => setInstrumental(e.target.checked)} />
              </label>
            </>
          )}

          <div className="border-t border-border pt-3 space-y-2">
            <div className="text-[10px] tracking-[0.18em] uppercase text-[#a78bfa]">GPT versuri</div>
            <select
              value={modelOptions.some((m) => m.id === openaiModel) ? openaiModel : '__custom__'}
              onChange={(e) => {
                if (e.target.value !== '__custom__') setOpenaiModel(e.target.value);
              }}
              className="h-9 w-full rounded-md border border-border bg-[#1c1924] px-2 text-sm"
            >
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {modelOptions
                    .filter((m) => m.group === g)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                </optgroup>
              ))}
              <option value="__custom__">alt id…</option>
            </select>
            <Input
              value={openaiModel}
              onChange={(e) => setOpenaiModel(e.target.value)}
              placeholder="id model, ex. gpt-5.6-luna"
              className="h-8 text-xs bg-[#1c1924] font-mono"
            />
            <RangeField
              label={isGpt5(openaiModel) ? 'temperatură (ignorată pe GPT-5)' : 'temperatură'}
              value={openaiTemperature}
              onChange={setOpenaiTemperature}
              min={0}
              max={2}
              step={0.05}
            />
            <Input
              value={languageOverride}
              onChange={(e) => setLanguageOverride(e.target.value)}
              placeholder="limbă forțată (ex. ucraineană)"
              className="h-8 text-xs bg-[#1c1924]"
            />
            <Input
              value={tipAmount}
              onChange={(e) => setTipAmount(e.target.value)}
              placeholder="sumă dedicație"
              className="h-8 text-xs bg-[#1c1924]"
            />
            <button type="button" className="text-[11px] text-[#a78bfa] hover:underline" onClick={() => setShowGpt((v) => !v)}>
              {showGpt ? 'Ascunde instrucțiunile GPT' : 'Instrucțiuni writer / critic'}
            </button>
            {showGpt && (
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    setWriterSystem(catalog.writer || meta?.defaultTemplates.writerSystem || '');
                    setWriterUser(form.suno?.writerUserTemplate || meta?.defaultTemplates.writerUser || '');
                    setCriticSystem(form.suno?.criticSystemPrompt || meta?.defaultTemplates.criticSystem || '');
                    setCriticUser(form.suno?.criticUserTemplate || meta?.defaultTemplates.criticUser || '');
                  }}
                >
                  <RotateCcw className="h-3 w-3" />
                  Reia din site
                </Button>
                <Textarea value={writerSystem} onChange={(e) => setWriterSystem(e.target.value)} rows={5} className="font-mono text-[11px] bg-[#1c1924]" />
                <Textarea value={writerUser} onChange={(e) => setWriterUser(e.target.value)} rows={5} className="font-mono text-[11px] bg-[#1c1924]" />
                <Textarea value={criticSystem} onChange={(e) => setCriticSystem(e.target.value)} rows={4} className="font-mono text-[11px] bg-[#1c1924]" />
                <Textarea value={criticUser} onChange={(e) => setCriticUser(e.target.value)} rows={4} className="font-mono text-[11px] bg-[#1c1924]" />
              </div>
            )}
          </div>
            </>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => void runPreview()}>
              Preview
            </Button>
            <button
              type="button"
              onClick={() => void generateAudio()}
              disabled={busyGenerate || pending}
              className="flex-1 h-11 rounded-xl bg-[#e11d48] text-white text-sm font-semibold tracking-wide disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {busyGenerate || pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {pending ? statusLabel(active!.status) : '●  GENEREAZĂ'}
            </button>
          </div>
        </div>

        <div className="space-y-3 xl:sticky xl:top-16">
          <div className="rounded-2xl border border-border bg-[#121018] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground">Monitor</div>
              {active && (
                <Badge variant={active.status === 'succeeded' ? 'success' : active.status === 'failed' ? 'destructive' : 'warning'}>
                  {statusLabel(active.status)}
                </Badge>
              )}
            </div>
            {active?.errorMessage && (
              <p className="text-sm text-destructive whitespace-pre-wrap leading-relaxed">{active.errorMessage}</p>
            )}
            {active?.tracks?.length ? (
              <div className="space-y-2">
                {active.tracks.map((t, i) => (
                  <div key={`${t.audioUrl}-${i}`}>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
                      <Volume2 className="h-3 w-3" />
                      Take {i + 1}
                      {t.durationSec ? ` · ${t.durationSec}s` : ''}
                    </div>
                    <audio controls src={absUrl(t.audioUrl)} className="w-full h-8" preload="metadata" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {pending ? 'Suno/Lyria: 2–8 minute.' : 'Nicio piesă încă.'}
              </p>
            )}
            {active?.lyrics && (
              <pre className="whitespace-pre-wrap font-mono text-[11px] bg-[#1c1924] rounded-lg p-2 max-h-48 overflow-auto">
                {active.lyrics}
              </pre>
            )}
            {active?.providerJobId && (
              <div className="text-[10px] text-muted-foreground font-mono break-all">{active.providerJobId}</div>
            )}
          </div>

          {preview && (
            <div className="rounded-2xl border border-border bg-[#121018] p-4 space-y-1">
              <div className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground mb-2">Ce pleacă</div>
              {engine === 'suno' ? (
                <>
                  <PreviewBlock title="style" text={preview.suno.style || '(default intern)'} />
                  <PreviewBlock title="prompt" text={preview.suno.prompt || '(gol)'} />
                </>
              ) : (
                <PreviewBlock title="Lyria" text={preview.lyria.prompt} />
              )}
              {formKind === 'fields' && <PreviewBlock title="writer user" text={preview.gpt.writerUser} />}
            </div>
          )}

          <div className="rounded-2xl border border-border bg-[#121018] p-4">
            <div className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground mb-2">Istoric</div>
            {history.length === 0 && <p className="text-sm text-muted-foreground">Gol.</p>}
            <ul className="grid gap-1">
              {history.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="w-full text-left rounded-lg px-2 py-1.5 text-xs hover:bg-[#1c1924]"
                    onClick={() => {
                      setActive(r);
                      if (r.lyrics) setLyrics(r.lyrics);
                    }}
                  >
                    <span className="font-medium">{r.engine === 'google' ? 'Lyria' : 'Suno'}</span>
                    {' · '}
                    {statusLabel(r.status)}
                    <span className="block text-[10px] text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString('ro-RO')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function lyriaModelChoices(fromMeta: string[] | undefined, current: string): string[] {
  return Array.from(
    new Set([...(fromMeta ?? ['lyria-3-pro-preview', 'lyria-3-clip-preview']), current].filter(Boolean)),
  );
}

function CharCount({ value }: { value: string }) {
  const n = [...value].length;
  return (
    <div className="flex justify-between text-[11px] text-muted-foreground pt-1">
      <span>
        {n === 1 ? '1 caracter' : `${n.toLocaleString('ro-RO')} caractere`}
      </span>
      {n === 0 ? <span>lipsește promptul</span> : null}
    </div>
  );
}

function KnobField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block space-y-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {hint && <span className="block text-[10px] text-muted-foreground/80 -mt-0.5">{hint}</span>}
      {children}
    </div>
  );
}

function RangeField({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.05,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const n = Number(value);
  const shown = Number.isFinite(n) ? n.toFixed(2) : value;
  return (
    <label className="block">
      <span className="flex justify-between text-[11px] text-muted-foreground">
        {label}
        <span className="font-mono text-foreground">{shown}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(n) ? n : min}
        onChange={(e) => onChange(e.target.value)}
        className="w-full accent-[#d4a84b]"
      />
    </label>
  );
}

function PreviewBlock({ title, text }: { title: string; text: string }) {
  return (
    <details>
      <summary className="text-[11px] cursor-pointer text-muted-foreground">{title}</summary>
      <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] bg-[#1c1924] rounded-md p-2 max-h-40 overflow-auto">
        {text}
      </pre>
    </details>
  );
}
