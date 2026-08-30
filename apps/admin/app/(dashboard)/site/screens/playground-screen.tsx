'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  Eye,
  FlaskConical,
  Loader2,
  RotateCcw,
  Sparkles,
  Wand2,
} from 'lucide-react';
import type { SiteDto } from '@/lib/api/sites.api';
import {
  PlaygroundApi,
  type PlaygroundEngine,
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

/**
 * Playground — trei laboratoare independente, nu un singur formular care face tot.
 *
 *   Versuri  → doar GPT: system/user prompt, model, temperatură. Fără audio, fără credite.
 *   Suno     → doar audio: style tag WYSIWYG + versurile lipite de tine + toate manetele.
 *   Lyria    → doar audio: UN singur prompt, fiindcă asta primește modelul. Versurile
 *              fac parte din prompt, nu sunt un câmp separat (vezi buildLyriaPrompt în API).
 *
 * Separarea e intenționată: prompturile se rafinează una câte una, iar amestecul
 * „scrie versuri + generează audio” dintr-un singur buton făcea imposibil de spus
 * care schimbare a produs care rezultat.
 */

const PLACEHOLDERS_WRITER = [
  '{{recipientName}}',
  '{{senderName}}',
  '{{message}}',
  '{{occasion}}',
  '{{style}}',
  '{{styleHint}}',
  '{{voiceArtist}}',
  '{{tipAmount}}',
  '{{currency}}',
];
const PLACEHOLDERS_CRITIC = [...PLACEHOLDERS_WRITER, '{{draft}}'];

type Tab = 'lyrics' | 'suno' | 'lyria';

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

function absUrl(rel: string): string {
  if (!rel || rel.startsWith('http')) return rel;
  return `${process.env.NEXT_PUBLIC_API_URL ?? ''}${rel}`;
}

function catalogOf(form: SiteDto, slug: string) {
  const cat = slug ? form.experienceConfig?.items?.[slug]?.catalog : undefined;
  return {
    styles: (Array.isArray(cat?.styles) ? cat?.styles ?? [] : form.styles ?? []) as Slim[],
    occasions: (Array.isArray(cat?.occasions) ? cat?.occasions ?? [] : form.occasions ?? []) as Slim[],
    voices: (Array.isArray(cat?.voices) ? cat?.voices ?? [] : form.voices ?? []) as Slim[],
    writer: cat?.writerSystemPrompt?.trim() || form.suno?.writerSystemPrompt || '',
    inherited: {
      styles: !!slug && !cat?.styles?.length,
      occasions: !!slug && !cat?.occasions?.length,
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

/** Modelele de raționament refuză `temperature` cu 400 — nu le arătăm câmpul. */
function isReasoningModel(model: string): boolean {
  const m = model.trim().toLowerCase();
  return m.startsWith('gpt-5') || /^o[1-9]/.test(m);
}

export function PlaygroundScreen({ form }: { form: SiteDto }) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('lyrics');
  const [meta, setMeta] = useState<PlaygroundMeta | null>(null);

  // --- context comun (variabilele de test + sursa de catalog) ----------------
  const [experienceSlug, setExperienceSlug] = useState('');
  const catalog = useMemo(() => catalogOf(form, experienceSlug), [form, experienceSlug]);
  const [styleId, setStyleId] = useState('');
  const [occasionId, setOccasionId] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [recipient, setRecipient] = useState('Mirela');
  const [sender, setSender] = useState('Costel');
  const [message, setMessage] = useState('La mulți ani cu sănătate');
  const [tipAmount, setTipAmount] = useState('');
  const [locale, setLocale] = useState(form.suno?.lyricsLocale || form.locale);
  const [languageOverride, setLanguageOverride] = useState('');
  const [contextOpen, setContextOpen] = useState(true);

  // --- GPT ------------------------------------------------------------------
  const [openaiModel, setOpenaiModel] = useState('');
  const [temperature, setTemperature] = useState('0.85');
  const [skipCritic, setSkipCritic] = useState(false);
  const [writerSystem, setWriterSystem] = useState('');
  const [writerUser, setWriterUser] = useState('');
  const [criticSystem, setCriticSystem] = useState('');
  const [criticUser, setCriticUser] = useState('');
  const [busyLyrics, setBusyLyrics] = useState(false);
  const [draft, setDraft] = useState('');
  const [finalLyrics, setFinalLyrics] = useState('');
  const [lyricsNotes, setLyricsNotes] = useState('');
  const [lyricsView, setLyricsView] = useState<'final' | 'draft' | 'prompt'>('final');
  const [gptPreview, setGptPreview] = useState<PlaygroundPreview['gpt'] | null>(null);

  // --- Suno -----------------------------------------------------------------
  const [sunoModel, setSunoModel] = useState('');
  const [sunoCustomMode, setSunoCustomMode] = useState(true);
  const [sunoStyleTag, setSunoStyleTag] = useState('');
  const [sunoTitle, setSunoTitle] = useState('');
  const [sunoLyrics, setSunoLyrics] = useState('');
  const [sunoDescription, setSunoDescription] = useState('');
  const [negativeTags, setNegativeTags] = useState('pop, EDM, trap-rap');
  const [vocalGender, setVocalGender] = useState<'m' | 'f' | ''>('m');
  const [styleWeight, setStyleWeight] = useState('0.65');
  const [weirdness, setWeirdness] = useState('0.30');
  const [personaId, setPersonaId] = useState('');
  const [personaModel, setPersonaModel] = useState<'style_persona' | 'voice_persona'>('style_persona');
  const [instrumental, setInstrumental] = useState(false);
  const [phonetic, setPhonetic] = useState(false);
  const [durationSec, setDurationSec] = useState('120');

  // --- Lyria ----------------------------------------------------------------
  const [lyriaModel, setLyriaModel] = useState('');
  const [lyriaPrompt, setLyriaPrompt] = useState('');
  const [lyriaLyrics, setLyriaLyrics] = useState('');
  const [variantCount, setVariantCount] = useState<1 | 2>(1);
  const [lyriaIngredientsOpen, setLyriaIngredientsOpen] = useState(false);

  // --- rulări ---------------------------------------------------------------
  const [preview, setPreview] = useState<PlaygroundPreview | null>(null);
  const [busyGenerate, setBusyGenerate] = useState(false);
  const [active, setActive] = useState<PlaygroundRun | null>(null);
  const [history, setHistory] = useState<PlaygroundRun[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const experiences = useMemo(() => {
    const items = form.experienceConfig?.items ?? {};
    return Object.keys(items).filter((slug) => items[slug]?.enabled !== false);
  }, [form.experienceConfig]);

  const style = catalog.styles.find((s) => s.id === styleId);
  const occasion = catalog.occasions.find((o) => o.id === occasionId);
  const voice = catalog.voices.find((v) => v.id === voiceId);

  /** Umple câmpurile de audio din intrarea de catalog aleasă. */
  const fillFromCatalog = useCallback((st?: Slim, oc?: Slim, vo?: Slim) => {
    setStyleId(st?.id ?? '');
    setOccasionId(oc?.id ?? '');
    setVoiceId(vo?.id ?? '');
    const tag = [st?.sunoPrompt ?? '', oc?.sunoPrompt ?? ''].map((s) => s.trim()).filter(Boolean).join(', ');
    setSunoStyleTag(tag);
    if (st?.styleWeight != null) setStyleWeight(String(st.styleWeight));
    if (st?.weirdnessConstraint != null) setWeirdness(String(st.weirdnessConstraint));
    if (st?.negativeTags) setNegativeTags(st.negativeTags);
    const gender = vo?.gender ?? (vo?.id === 'female' ? 'f' : vo?.id === 'male' ? 'm' : '');
    if (gender) setVocalGender(gender);
    setPersonaId(
      (gender === 'f' ? st?.sunoPersonaIdFemale : gender === 'm' ? st?.sunoPersonaIdMale : '') ||
        vo?.sunoPersonaId ||
        '',
    );
  }, []);

  useEffect(() => {
    PlaygroundApi.meta()
      .then((m) => {
        setMeta(m);
        setOpenaiModel((p) => p || m.openaiModel);
        setSunoModel((p) => p || m.sunoModel);
        setLyriaModel((p) => p || m.lyriaModel);
        setWriterSystem((p) => p || form.suno?.writerSystemPrompt || m.defaultTemplates.writerSystem);
        setWriterUser((p) => p || form.suno?.writerUserTemplate || m.defaultTemplates.writerUser);
        setCriticSystem((p) => p || form.suno?.criticSystemPrompt || m.defaultTemplates.criticSystem);
        setCriticUser((p) => p || form.suno?.criticUserTemplate || m.defaultTemplates.criticUser);
      })
      .catch((e) => toast({ variant: 'destructive', title: 'Meta playground', description: (e as Error).message }));
    PlaygroundApi.runs()
      .then((r) => setHistory(r.items))
      .catch(() => undefined);
    const c = catalogOf(form, '');
    fillFromCatalog(c.styles[0], c.occasions[0], c.voices[0]);
    // o dată per site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const num = (v: string) => {
    if (!v.trim()) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  /** Variabilele care umplu {{placeholder}}-ele + selecția de catalog. */
  function contextBody(): PlaygroundRequest {
    return {
      experienceSlug: experienceSlug || undefined,
      styleId: styleId || undefined,
      occasionId: occasionId || undefined,
      voiceId: voiceId || undefined,
      recipientName: recipient,
      senderName: sender,
      message,
      tipAmount: num(tipAmount),
      locale,
      languageOverride: languageOverride || undefined,
    };
  }

  function lyricsBody(): PlaygroundRequest {
    return {
      ...contextBody(),
      engine: 'suno',
      lyricsMode: skipCritic ? 'writer_only' : 'generate',
      skipCritic,
      openaiModel: openaiModel || undefined,
      openaiTemperature: isReasoningModel(openaiModel) ? undefined : num(temperature),
      writerSystemPrompt: writerSystem,
      writerUserTemplate: writerUser,
      criticSystemPrompt: criticSystem,
      criticUserTemplate: criticUser,
    };
  }

  function sunoBody(): PlaygroundRequest {
    return {
      ...contextBody(),
      engine: 'suno',
      lyricsMode: instrumental ? 'instrumental' : 'custom',
      lyrics: sunoCustomMode && !instrumental ? sunoLyrics : undefined,
      // Style tag WYSIWYG: tot textul intră pe „style”, ocazia rămâne goală ca
      // backend-ul să nu mai concateneze nimic peste ce ai scris.
      sunoStylePrompt: sunoStyleTag,
      sunoOccasionPrompt: '',
      sunoPromptOverride: !sunoCustomMode && !instrumental ? sunoDescription || undefined : undefined,
      sunoModel: sunoModel || undefined,
      sunoCustomMode: instrumental ? false : sunoCustomMode,
      sunoTitle: sunoTitle || undefined,
      negativeTags: negativeTags || undefined,
      vocalGender: vocalGender || undefined,
      styleWeight: num(styleWeight),
      weirdnessConstraint: num(weirdness),
      personaId: personaId || undefined,
      personaModel,
      instrumental,
      phonetic,
      durationSec: num(durationSec),
    };
  }

  function lyriaBody(): PlaygroundRequest {
    return {
      ...contextBody(),
      engine: 'google',
      lyricsMode: instrumental ? 'instrumental' : 'custom',
      lyrics: lyriaLyrics || undefined,
      lyriaModel: lyriaModel || undefined,
      lyriaStylePrompt: style?.googlePrompt ?? '',
      lyriaOccasionPrompt: occasion?.googlePrompt ?? occasion?.nm ?? '',
      lyriaPromptOverride: lyriaPrompt || undefined,
      vocalGender: vocalGender || undefined,
      instrumental,
      durationSec: num(durationSec),
      variantCount,
    };
  }

  function bodyFor(t: Tab): PlaygroundRequest {
    return t === 'lyrics' ? lyricsBody() : t === 'suno' ? sunoBody() : lyriaBody();
  }

  // --- acțiuni --------------------------------------------------------------

  async function writeLyrics() {
    setBusyLyrics(true);
    try {
      const res = await PlaygroundApi.lyrics(lyricsBody());
      setDraft(res.draft);
      setFinalLyrics(res.final);
      setLyricsNotes(res.notes);
      setLyricsView('final');
      toast({ variant: 'success', title: 'Versuri gata', description: skipCritic ? 'Doar scriitorul' : 'Scriitor + editor' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Versurile au eșuat', description: (e as Error).message });
    } finally {
      setBusyLyrics(false);
    }
  }

  async function showGptPrompt() {
    try {
      const p = await PlaygroundApi.preview(lyricsBody());
      setGptPreview(p.gpt);
      setLyricsView('prompt');
    } catch (e) {
      toast({ variant: 'destructive', title: 'Preview eșuat', description: (e as Error).message });
    }
  }

  async function runPreview(t: Tab) {
    try {
      const p = await PlaygroundApi.preview(bodyFor(t));
      setPreview(p);
      return p;
    } catch (e) {
      toast({ variant: 'destructive', title: 'Preview eșuat', description: (e as Error).message });
      return null;
    }
  }

  /** Reconstruiește promptul Lyria din catalog + versuri, exact ca API-ul. */
  async function buildLyria() {
    const p = await PlaygroundApi.preview({ ...lyriaBody(), lyriaPromptOverride: undefined }).catch((e) => {
      toast({ variant: 'destructive', title: 'Construcție eșuată', description: (e as Error).message });
      return null;
    });
    if (!p) return;
    setLyriaPrompt(p.lyria.prompt);
    toast({ title: 'Prompt construit', description: 'Editează-l liber — se trimite exact așa cum e.' });
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
          if (run.status === 'failed') {
            toast({ variant: 'destructive', title: 'Generarea a eșuat', description: run.errorMessage ?? '' });
          } else {
            toast({ variant: 'success', title: 'Audio gata' });
          }
        }
      } catch {
        /* ignore */
      }
    }, 4000);
  }

  async function generate(engine: PlaygroundEngine) {
    if (engine === 'suno' && sunoCustomMode && !instrumental && !sunoLyrics.trim()) {
      toast({ variant: 'destructive', title: 'Lipsesc versurile', description: 'Custom mode cântă exact ce scrii aici.' });
      return;
    }
    if (engine === 'suno' && !sunoCustomMode && !instrumental && !sunoDescription.trim()) {
      toast({ variant: 'destructive', title: 'Lipsește descrierea', description: 'În description mode, Suno are nevoie de o descriere.' });
      return;
    }
    if (engine === 'google' && !lyriaPrompt.trim()) {
      toast({ variant: 'destructive', title: 'Promptul e gol', description: 'Scrie-l sau apasă „Construiește din catalog”.' });
      return;
    }
    const ok = await confirmDialog({
      title: engine === 'suno' ? 'Generezi pe Suno?' : 'Generezi pe Google Lyria?',
      description:
        engine === 'suno'
          ? 'Consumă credite Suno reale (~10 per cerere, 2 piese). Nu se creează o comandă de client.'
          : `Apelează Lyria de ${variantCount} ${variantCount === 1 ? 'dată' : 'ori'} (~0,08 USD fiecare). Lyria n-are plan gratuit.`,
      confirmText: 'Generează',
    });
    if (!ok) return;
    setBusyGenerate(true);
    try {
      const run = await PlaygroundApi.generate(bodyFor(engine === 'suno' ? 'suno' : 'lyria'));
      setActive(run);
      setHistory((prev) => [run, ...prev.filter((r) => r.id !== run.id)]);
      startPolling(run.id);
    } catch (e) {
      setBusyGenerate(false);
      toast({ variant: 'destructive', title: 'Nu am putut porni generarea', description: (e as Error).message });
    }
  }

  const pending =
    active?.status === 'queued' || active?.status === 'writing_lyrics' || active?.status === 'generating_audio';

  const modelOptions = meta?.openaiModelOptions?.length
    ? meta.openaiModelOptions
    : (meta?.openaiModels ?? []).map((id) => ({ id, label: id, group: 'Modele' }));
  const modelGroups = [...new Set(modelOptions.map((m) => m.group))];

  return (
    <div className="grid gap-5" data-field="playground">
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            Playground
          </h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Trei laboratoare separate. Nimic de aici nu creează comenzi de client și nu modifică
            configul site-ului — prompturile trăiesc doar în rularea curentă.
          </p>
        </div>
        <div className="flex rounded-lg border border-border bg-card p-0.5">
          {(
            [
              ['lyrics', 'Versuri (GPT)'],
              ['suno', 'Suno'],
              ['lyria', 'Google Lyria'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'px-3.5 py-1.5 text-sm rounded-md transition-colors',
                tab === id
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* --- context comun ------------------------------------------------ */}
      <Panel
        title="Date de test"
        subtitle="Umplu placeholder-ele din prompturile GPT și dau valorile pentru butoanele „ia din catalog”."
        open={contextOpen}
        onToggle={() => setContextOpen((v) => !v)}
        badge={`${style?.nm ?? '—'} · ${occasion?.nm ?? '—'} · ${voice?.nm ?? '—'}`}
      >
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Sursă catalog">
            <Select
              value={experienceSlug}
              onChange={(v) => {
                setExperienceSlug(v);
                const c = catalogOf(form, v);
                fillFromCatalog(c.styles[0], c.occasions[0], c.voices[0]);
              }}
            >
              <option value="">Librărie (tenant)</option>
              {experiences.map((slug) => (
                <option key={slug} value={slug}>
                  Interfața {humanExperienceLabel(slug)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Stil">
            <Select
              value={styleId}
              onChange={(v) => fillFromCatalog(catalog.styles.find((s) => s.id === v), occasion, voice)}
            >
              {catalog.styles.length === 0 && <option value="">Fără stiluri</option>}
              {catalog.styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nm}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ocazie">
            <Select
              value={occasionId}
              onChange={(v) => fillFromCatalog(style, catalog.occasions.find((o) => o.id === v), voice)}
            >
              {catalog.occasions.length === 0 && <option value="">Fără ocazii</option>}
              {catalog.occasions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nm}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Voce">
            <Select
              value={voiceId}
              onChange={(v) => fillFromCatalog(style, occasion, catalog.voices.find((x) => x.id === v))}
            >
              {catalog.voices.length === 0 && <option value="">Fără voci</option>}
              {catalog.voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nm}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Destinatar">
            <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          </Field>
          <Field label="De la">
            <Input value={sender} onChange={(e) => setSender(e.target.value)} />
          </Field>
          <Field label="Mesaj / dedicație" className="md:col-span-2">
            <Input value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <Field label="Limbă versuri">
            <Select value={locale} onChange={setLocale}>
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_LABELS[l] ?? l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Forțează limba (text liber)" hint="Gol = limba de mai sus">
            <Input value={languageOverride} onChange={(e) => setLanguageOverride(e.target.value)} placeholder="ex. Greek" />
          </Field>
          <Field label="Sumă dedicație" hint="Doar pentru {{tipAmount}}">
            <Input value={tipAmount} onChange={(e) => setTipAmount(e.target.value)} placeholder="—" />
          </Field>
        </div>
        {experienceSlug && (catalog.inherited.styles || catalog.inherited.occasions) && (
          <p className="text-xs text-warning">
            Interfața {humanExperienceLabel(experienceSlug)} n-are catalog propriu — vezi librăria
            tenantului. Ca să testezi prompturi separate, pune-le la Interfețe → Catalog.
          </p>
        )}
      </Panel>

      {/* ================================================================== */}
      {tab === 'lyrics' && (
        <div className="grid gap-4 lg:grid-cols-5 items-start">
          <div className="lg:col-span-3 grid gap-4">
            <Panel title="Model" subtitle="Ce model scrie și cât de liber e.">
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Model OpenAI" className="md:col-span-2">
                  <Select value={openaiModel} onChange={setOpenaiModel}>
                    {modelGroups.map((g) => (
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
                  </Select>
                </Field>
                {isReasoningModel(openaiModel) ? (
                  <Field label="Temperatură" hint="Modelele de raționament o refuză">
                    <div className="h-9 flex items-center text-sm text-muted-foreground">
                      nu se aplică
                    </div>
                  </Field>
                ) : (
                  <Field label={`Temperatură · ${temperature}`} hint="0 = factual, 1 = creativ">
                    <input
                      type="range"
                      min={0}
                      max={1.4}
                      step={0.05}
                      value={temperature}
                      onChange={(e) => setTemperature(e.target.value)}
                      className="w-full accent-[hsl(var(--primary))]"
                    />
                  </Field>
                )}
              </div>
              <Toggle
                checked={skipCritic}
                onChange={setSkipCritic}
                label="Doar scriitorul (sari peste editor)"
                hint="Vezi ciorna brută, fără al doilea pas GPT. Mai rapid și mai ieftin când testezi promptul de scriitor."
              />
            </Panel>

            <Panel title="Scriitor" subtitle="Primul pas: GPT scrie ciorna.">
              <PromptField
                label="System prompt"
                value={writerSystem}
                onChange={setWriterSystem}
                rows={12}
                placeholders={PLACEHOLDERS_WRITER}
                onReset={() => setWriterSystem(meta?.defaultTemplates.writerSystem ?? '')}
                onFromSite={
                  form.suno?.writerSystemPrompt ? () => setWriterSystem(form.suno?.writerSystemPrompt ?? '') : undefined
                }
              />
              <PromptField
                label="User prompt"
                value={writerUser}
                onChange={setWriterUser}
                rows={8}
                placeholders={PLACEHOLDERS_WRITER}
                onReset={() => setWriterUser(meta?.defaultTemplates.writerUser ?? '')}
                onFromSite={
                  form.suno?.writerUserTemplate ? () => setWriterUser(form.suno?.writerUserTemplate ?? '') : undefined
                }
              />
            </Panel>

            <Panel
              title="Editor"
              subtitle="Al doilea pas: rafinează ciorna. Are în plus {{draft}}."
              muted={skipCritic}
            >
              <PromptField
                label="System prompt"
                value={criticSystem}
                onChange={setCriticSystem}
                rows={10}
                disabled={skipCritic}
                placeholders={PLACEHOLDERS_CRITIC}
                onReset={() => setCriticSystem(meta?.defaultTemplates.criticSystem ?? '')}
                onFromSite={
                  form.suno?.criticSystemPrompt ? () => setCriticSystem(form.suno?.criticSystemPrompt ?? '') : undefined
                }
              />
              <PromptField
                label="User prompt"
                value={criticUser}
                onChange={setCriticUser}
                rows={7}
                disabled={skipCritic}
                placeholders={PLACEHOLDERS_CRITIC}
                onReset={() => setCriticUser(meta?.defaultTemplates.criticUser ?? '')}
                onFromSite={
                  form.suno?.criticUserTemplate ? () => setCriticUser(form.suno?.criticUserTemplate ?? '') : undefined
                }
              />
            </Panel>
          </div>

          {/* rezultat versuri */}
          <div className="lg:col-span-2 lg:sticky lg:top-4 grid gap-3">
            <div className="flex gap-2">
              <Button className="flex-1" onClick={writeLyrics} disabled={busyLyrics}>
                {busyLyrics ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {busyLyrics ? 'Scrie…' : 'Scrie versurile'}
              </Button>
              <Button variant="outline" onClick={showGptPrompt} title="Prompturile exacte, cu variabilele completate">
                <Eye className="h-4 w-4" />
              </Button>
            </div>

            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center gap-1 border-b border-border p-1.5">
                {(
                  [
                    ['final', 'Final'],
                    ['draft', 'Ciornă'],
                    ['prompt', 'Prompt trimis'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setLyricsView(id)}
                    className={cn(
                      'px-2.5 py-1 text-xs rounded-md transition-colors',
                      lyricsView === id
                        ? 'bg-secondary text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
                {lyricsNotes && (
                  <Badge variant="muted" className="ml-auto mr-1">
                    {lyricsNotes === 'writer_critic' ? 'scriitor + editor' : lyricsNotes}
                  </Badge>
                )}
              </div>
              <div className="p-3">
                {lyricsView === 'prompt' ? (
                  gptPreview ? (
                    <div className="space-y-3">
                      <PromptDump label="Writer · system" text={gptPreview.writerSystem} />
                      <PromptDump label="Writer · user" text={gptPreview.writerUser} />
                      {!skipCritic && <PromptDump label="Editor · system" text={gptPreview.criticSystem} />}
                      {!skipCritic && <PromptDump label="Editor · user" text={gptPreview.criticUser} />}
                    </div>
                  ) : (
                    <Empty>Apasă ochiul ca să vezi prompturile exacte trimise la GPT.</Empty>
                  )
                ) : (
                  <Textarea
                    value={lyricsView === 'final' ? finalLyrics : draft}
                    onChange={(e) =>
                      lyricsView === 'final' ? setFinalLyrics(e.target.value) : setDraft(e.target.value)
                    }
                    rows={20}
                    className="font-mono text-[12px] leading-relaxed"
                    placeholder="Versurile apar aici. Le poți edita înainte să le trimiți la audio."
                  />
                )}
              </div>
              {lyricsView !== 'prompt' && (
                <div className="flex flex-wrap gap-2 border-t border-border p-2">
                  <CopyButton text={lyricsView === 'final' ? finalLyrics : draft} />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!finalLyrics.trim() && !draft.trim()}
                    onClick={() => {
                      setSunoLyrics(lyricsView === 'final' ? finalLyrics : draft);
                      setTab('suno');
                    }}
                  >
                    Trimite la Suno
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!finalLyrics.trim() && !draft.trim()}
                    onClick={() => {
                      setLyriaLyrics(lyricsView === 'final' ? finalLyrics : draft);
                      setTab('lyria');
                    }}
                  >
                    Trimite la Lyria
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {tab === 'suno' && (
        <div className="grid gap-4 lg:grid-cols-5 items-start">
          <div className="lg:col-span-3 grid gap-4">
            <Panel title="Model și mod" subtitle="Custom mode cântă exact versurile tale. Description mode îl lasă pe Suno să le scrie.">
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Model Suno">
                  <Select value={sunoModel} onChange={setSunoModel}>
                    {(meta?.sunoModels ?? []).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Titlu piesă" hint="Gol = „Pentru X, de la Y”">
                  <Input value={sunoTitle} onChange={(e) => setSunoTitle(e.target.value)} placeholder="—" />
                </Field>
                <Field label={`Durată · ${durationSec}s`} hint="30-240">
                  <input
                    type="range"
                    min={30}
                    max={240}
                    step={10}
                    value={durationSec}
                    onChange={(e) => setDurationSec(e.target.value)}
                    className="w-full accent-[hsl(var(--primary))]"
                  />
                </Field>
              </div>
              <Seg
                value={instrumental ? 'instrumental' : sunoCustomMode ? 'custom' : 'description'}
                onChange={(v) => {
                  setInstrumental(v === 'instrumental');
                  setSunoCustomMode(v !== 'description');
                }}
                options={[
                  ['custom', 'Custom (versurile mele)'],
                  ['description', 'Description (Suno scrie)'],
                  ['instrumental', 'Instrumental'],
                ]}
              />
            </Panel>

            <Panel
              title="Style tag"
              subtitle="Exact textul trimis pe câmpul „style”. E WYSIWYG: promptul de bază al site-ului NU se mai lipește peste el."
            >
              <PromptField
                label=""
                value={sunoStyleTag}
                onChange={setSunoStyleTag}
                rows={4}
                mono
                inserts={[
                  ...(style?.sunoPrompt ? [{ label: `Stil: ${style.nm}`, text: style.sunoPrompt }] : []),
                  ...(occasion?.sunoPrompt ? [{ label: `Ocazie: ${occasion.nm}`, text: occasion.sunoPrompt }] : []),
                  ...(form.suno?.basePrompt ? [{ label: 'Prompt de bază (site)', text: form.suno.basePrompt }] : []),
                ]}
              />
              <Field label="Negative tags" hint="Ce să evite. CSV.">
                <Input value={negativeTags} onChange={(e) => setNegativeTags(e.target.value)} />
              </Field>
            </Panel>

            <Panel title="Manete" subtitle="Cât de strict urmează tag-urile și cât de mult inventează.">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label={`Style influence · ${styleWeight}`} hint="0 = liber, 1 = lipit de tag-uri">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={styleWeight}
                    onChange={(e) => setStyleWeight(e.target.value)}
                    className="w-full accent-[hsl(var(--primary))]"
                  />
                </Field>
                <Field label={`Weirdness · ${weirdness}`} hint="0 = predictibil, 1 = experimental">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={weirdness}
                    onChange={(e) => setWeirdness(e.target.value)}
                    className="w-full accent-[hsl(var(--primary))]"
                  />
                </Field>
                <Field label="Voce">
                  <Seg
                    value={vocalGender || 'auto'}
                    onChange={(v) => setVocalGender(v === 'auto' ? '' : (v as 'm' | 'f'))}
                    options={[
                      ['m', 'Bărbat'],
                      ['f', 'Femeie'],
                      ['auto', 'Auto'],
                    ]}
                  />
                </Field>
                <Field label="Persona model" hint="voice_persona doar pe V5+">
                  <Seg
                    value={personaModel}
                    onChange={(v) => setPersonaModel(v as 'style_persona' | 'voice_persona')}
                    options={[
                      ['style_persona', 'style'],
                      ['voice_persona', 'voice'],
                    ]}
                  />
                </Field>
                <Field label="Persona ID" className="md:col-span-2" hint="Forțează aceeași voce între piese. Custom mode only.">
                  <Input value={personaId} onChange={(e) => setPersonaId(e.target.value)} placeholder="—" />
                </Field>
              </div>
            </Panel>

            {!instrumental && (
              <Panel
                title={sunoCustomMode ? 'Versuri' : 'Descrierea piesei'}
                subtitle={
                  sunoCustomMode
                    ? 'Se cântă literal. Lipește-le din tabul Versuri sau scrie-le de mână.'
                    : 'Suno scrie versurile pornind de la descrierea asta (~500 caractere).'
                }
              >
                <PromptField
                  label=""
                  value={sunoCustomMode ? sunoLyrics : sunoDescription}
                  onChange={sunoCustomMode ? setSunoLyrics : setSunoDescription}
                  rows={sunoCustomMode ? 16 : 5}
                  mono
                  inserts={
                    sunoCustomMode && (finalLyrics || draft)
                      ? [{ label: 'Ia versurile din tabul Versuri', text: finalLyrics || draft, replace: true }]
                      : []
                  }
                />
                {sunoCustomMode && (
                  <Toggle
                    checked={phonetic}
                    onChange={setPhonetic}
                    label="Fonetizare înainte de trimitere"
                    hint="Rescrie versurile fonetic pentru pronunție corectă. Schimbă exact ce se cântă."
                  />
                )}
              </Panel>
            )}
          </div>

          <RunColumn
            engine="suno"
            busy={busyGenerate}
            pending={!!pending}
            active={active}
            preview={preview}
            onPreview={() => runPreview('suno')}
            onGenerate={() => generate('suno')}
            costHint="~10 credite Suno · 2 piese"
          />
        </div>
      )}

      {/* ================================================================== */}
      {tab === 'lyria' && (
        <div className="grid gap-4 lg:grid-cols-5 items-start">
          <div className="lg:col-span-3 grid gap-4">
            <Panel
              title="Prompt"
              subtitle="Lyria primește un singur text. Stilul, ocazia, vocea, limba și versurile fac toate parte din el — de-aia nu există câmpuri separate."
            >
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={buildLyria}>
                  <Sparkles className="h-3.5 w-3.5" />
                  Construiește din catalog + versuri
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setLyriaPrompt('')} disabled={!lyriaPrompt}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Golește
                </Button>
                <CopyButton text={lyriaPrompt} size="sm" />
                <span className="ml-auto self-center text-xs text-muted-foreground">
                  {lyriaPrompt.length} caractere
                </span>
              </div>
              <Textarea
                value={lyriaPrompt}
                onChange={(e) => setLyriaPrompt(e.target.value)}
                rows={22}
                className="font-mono text-[12px] leading-relaxed"
                placeholder={
                  'Create a full-length 2-minute authentic Romanian manele song.\n…\nLyrics:\n[Verse 1]\n…'
                }
              />
            </Panel>

            <Panel
              title="Ingrediente pentru construire"
              subtitle="Folosite doar de butonul „Construiește”. Nu se trimit separat la Lyria."
              open={lyriaIngredientsOpen}
              onToggle={() => setLyriaIngredientsOpen((v) => !v)}
            >
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Prompt Google al stilului" className="md:col-span-3" hint="Din catalog, doar informativ">
                  <div className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs font-mono text-muted-foreground min-h-9">
                    {style?.googlePrompt || '— stilul nu are prompt Google —'}
                  </div>
                </Field>
                <Field label="Voce">
                  <Seg
                    value={vocalGender || 'auto'}
                    onChange={(v) => setVocalGender(v === 'auto' ? '' : (v as 'm' | 'f'))}
                    options={[
                      ['m', 'Bărbat'],
                      ['f', 'Femeie'],
                      ['auto', 'Auto'],
                    ]}
                  />
                </Field>
                <Field label={`Durată · ${durationSec}s`} hint="Devine „X-minute” în prompt">
                  <input
                    type="range"
                    min={30}
                    max={240}
                    step={10}
                    value={durationSec}
                    onChange={(e) => setDurationSec(e.target.value)}
                    className="w-full accent-[hsl(var(--primary))]"
                  />
                </Field>
                <Field label="Instrumental">
                  <Toggle checked={instrumental} onChange={setInstrumental} label="Fără voce" />
                </Field>
                <Field label="Versuri de inserat în prompt" className="md:col-span-3">
                  <Textarea
                    value={lyriaLyrics}
                    onChange={(e) => setLyriaLyrics(e.target.value)}
                    rows={8}
                    className="font-mono text-[12px]"
                    placeholder="Lipește versurile aici, apoi apasă „Construiește”."
                  />
                </Field>
              </div>
            </Panel>

            <Panel title="Model" subtitle="Câte variante ceri și pe ce model.">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Model Lyria">
                  <Select value={lyriaModel} onChange={setLyriaModel}>
                    {(meta?.lyriaModels ?? []).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Variante" hint="Fiecare variantă = un apel plătit">
                  <Seg
                    value={String(variantCount)}
                    onChange={(v) => setVariantCount(v === '2' ? 2 : 1)}
                    options={[
                      ['1', 'O piesă'],
                      ['2', 'Două piese'],
                    ]}
                  />
                </Field>
              </div>
            </Panel>
          </div>

          <RunColumn
            engine="google"
            busy={busyGenerate}
            pending={!!pending}
            active={active}
            preview={preview}
            onPreview={() => runPreview('lyria')}
            onGenerate={() => generate('google')}
            costHint={`~${(0.08 * variantCount).toFixed(2)} USD`}
          />
        </div>
      )}

      {/* ================================================================== */}
      {history.length > 0 && (
        <Panel title="Rulări recente" subtitle="Ultimele generări de pe acest site.">
          <div className="grid gap-2">
            {history.slice(0, 12).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setActive(r);
                  setTab(r.engine === 'google' ? 'lyria' : 'suno');
                }}
                className={cn(
                  'w-full text-left rounded-lg border px-3 py-2 transition-colors',
                  active?.id === r.id ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-primary/30',
                )}
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant={r.engine === 'suno' ? 'default' : 'info'}>
                    {r.engine === 'suno' ? 'Suno' : 'Lyria'}
                  </Badge>
                  <Badge
                    variant={
                      r.status === 'succeeded' ? 'success' : r.status === 'failed' ? 'destructive' : 'warning'
                    }
                  >
                    {statusLabel(r.status)}
                  </Badge>
                  <span className="text-muted-foreground text-xs">{r.audioModel ?? '—'}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString('ro-RO')}
                  </span>
                </div>
                {r.errorMessage && (
                  <div className="mt-1 text-xs text-destructive line-clamp-2">{r.errorMessage}</div>
                )}
              </button>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Coloana de rulare — identică pentru Suno și Lyria.                          */

function RunColumn({
  engine,
  busy,
  pending,
  active,
  preview,
  onPreview,
  onGenerate,
  costHint,
}: {
  engine: PlaygroundEngine;
  busy: boolean;
  pending: boolean;
  active: PlaygroundRun | null;
  preview: PlaygroundPreview | null;
  onPreview: () => void;
  onGenerate: () => void;
  costHint: string;
}) {
  // O rulare de Suno n-are ce căuta în coloana Lyria și invers — altfel pare
  // că tocmai ai generat pe motorul pe care te uiți.
  const mine = active?.engine === engine ? active : null;
  const tracks = mine?.tracks ?? [];
  const showPreview = preview && preview.engine === engine;
  return (
    <div className="lg:col-span-2 lg:sticky lg:top-4 grid gap-3">
      <div className="flex gap-2">
        <Button className="flex-1" onClick={onGenerate} disabled={busy || pending}>
          {busy || pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy || pending ? statusLabel(mine?.status ?? 'queued') : 'Generează'}
        </Button>
        <Button variant="outline" onClick={onPreview} title="Ce se trimite exact">
          <Eye className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground -mt-1">Cost estimat: {costHint}</p>

      {mine && (
        <div className="rounded-xl border border-border bg-card p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Badge
              variant={
                mine.status === 'succeeded' ? 'success' : mine.status === 'failed' ? 'destructive' : 'warning'
              }
            >
              {statusLabel(mine.status)}
            </Badge>
            <span className="text-xs text-muted-foreground">{mine.audioModel ?? ''}</span>
          </div>
          {mine.errorMessage && <p className="text-sm text-destructive">{mine.errorMessage}</p>}
          {tracks.map((t, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Piesa {i + 1}</span>
                <a
                  href={absUrl(t.audioUrl)}
                  download
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <Download className="h-3 w-3" />
                  descarcă
                </a>
              </div>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls preload="none" src={absUrl(t.audioUrl)} className="w-full h-9" />
            </div>
          ))}
          {mine.lyrics && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Versurile cântate
              </summary>
              <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
                {mine.lyricsPhonetic || mine.lyrics}
              </pre>
            </details>
          )}
        </div>
      )}

      {showPreview && (
        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <div className="text-xs font-semibold">Ce se trimite</div>
          {engine === 'suno' ? (
            <>
              <KV k="model" v={preview.suno.model ?? '(default)'} />
              <KV k="mod" v={preview.suno.customMode ? 'custom' : 'description'} />
              <KV k="voce" v={preview.suno.vocalGender ?? 'auto'} />
              <KV k="style influence" v={String(preview.suno.styleWeight ?? '—')} />
              <KV k="weirdness" v={String(preview.suno.weirdnessConstraint ?? '—')} />
              <KV k="persona" v={preview.suno.personaId ?? '—'} />
              <PromptDump label="style" text={preview.suno.style ?? ''} />
              <PromptDump label="prompt" text={preview.suno.prompt ?? ''} />
            </>
          ) : (
            <>
              <KV k="model" v={preview.lyria.model ?? '(default)'} />
              <KV k="limbă" v={preview.lyria.lyricsLocale} />
              <PromptDump label="prompt" text={preview.lyria.prompt} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Primitive locale.                                                           */

function Panel({
  title,
  subtitle,
  children,
  open,
  onToggle,
  badge,
  muted,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  open?: boolean;
  onToggle?: () => void;
  badge?: string;
  muted?: boolean;
}) {
  const collapsible = typeof open === 'boolean' && !!onToggle;
  const expanded = collapsible ? open : true;
  return (
    <section
      className={cn(
        'rounded-xl border border-border bg-card transition-opacity',
        muted && 'opacity-60',
      )}
    >
      <div
        className={cn('flex items-start gap-3 p-4', collapsible && 'cursor-pointer select-none')}
        onClick={collapsible ? onToggle : undefined}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            {badge && (
              <Badge variant="muted" className="font-normal truncate max-w-[280px]">
                {badge}
              </Badge>
            )}
          </div>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{subtitle}</p>}
        </div>
        {collapsible && (
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')}
          />
        )}
      </div>
      {expanded && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </section>
  );
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      {label && (
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium">{label}</span>
          {hint && <span className="text-[11px] text-muted-foreground truncate">{hint}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
    >
      {children}
    </select>
  );
}

function Seg({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<readonly [string, string]>;
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-background p-0.5">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            'px-3 py-1.5 text-xs rounded transition-colors',
            value === id ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-start gap-2.5 text-left w-full"
    >
      <span
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors',
          checked ? 'border-primary bg-primary/20 text-primary' : 'border-border',
        )}
      >
        {checked && <Check className="h-3 w-3" />}
      </span>
      <span className="min-w-0">
        <span className="text-xs font-medium">{label}</span>
        {hint && <span className="block text-[11px] text-muted-foreground leading-relaxed">{hint}</span>}
      </span>
    </button>
  );
}

function PromptField({
  label,
  value,
  onChange,
  rows,
  disabled,
  mono = true,
  placeholders,
  inserts,
  onReset,
  onFromSite,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  disabled?: boolean;
  mono?: boolean;
  placeholders?: string[];
  inserts?: Array<{ label: string; text: string; replace?: boolean }>;
  onReset?: () => void;
  onFromSite?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function insertAtCursor(text: string, replace = false) {
    if (replace) {
      onChange(text);
      return;
    }
    const el = ref.current;
    if (!el) {
      onChange(`${value}${text}`);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + text + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  }

  return (
    <div className="space-y-1.5">
      {(label || onReset || onFromSite) && (
        <div className="flex items-center gap-2">
          {label && <span className="text-xs font-medium">{label}</span>}
          <span className="ml-auto flex items-center gap-1">
            {onFromSite && (
              <button
                type="button"
                onClick={onFromSite}
                disabled={disabled}
                className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                din site
              </button>
            )}
            {onReset && (
              <button
                type="button"
                onClick={onReset}
                disabled={disabled}
                className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                default
              </button>
            )}
            <span className="text-[11px] text-muted-foreground tabular-nums">{value.length}</span>
          </span>
        </div>
      )}
      <Textarea
        ref={ref}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className={cn(mono && 'font-mono text-[12px] leading-relaxed')}
      />
      {(placeholders?.length || inserts?.length) && !disabled && (
        <div className="flex flex-wrap gap-1">
          {inserts?.map((i) => (
            <button
              key={i.label}
              type="button"
              onClick={() => insertAtCursor(i.text, i.replace)}
              className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary hover:bg-primary/20"
            >
              {i.label}
            </button>
          ))}
          {placeholders?.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => insertAtCursor(p)}
              className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PromptDump({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <details className="rounded-md border border-border bg-background/60">
      <summary className="cursor-pointer px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
        {label} · {text.length} caractere
      </summary>
      <pre className="max-h-72 overflow-auto px-2.5 pb-2.5 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">
        {text}
      </pre>
    </details>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono text-[11px] truncate">{v}</span>
    </div>
  );
}

function CopyButton({ text, size = 'sm' }: { text: string; size?: 'sm' | 'default' }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size={size}
      variant="outline"
      disabled={!text}
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copiat' : 'Copiază'}
    </Button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{children}</div>;
}
