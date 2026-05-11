'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, RefreshCcw, Wand2, AlertTriangle, CheckCircle2, Loader2, Music2, Mic2, Settings2, Sparkles, ChevronDown, ChevronUp, Upload } from 'lucide-react';
import { SitesApi, type SiteDto, type SamplesListDto, type SampleStatusDto } from '@/lib/api/sites.api';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { confirmDialog } from '@/components/ui/confirm-dialog';

// Etichete default (folosite când site-ul nu are site.styles/voices configurate).
const STYLE_LABELS: Record<string, string> = {
  clasic: 'Clasică de pahar', modern: 'Modernă', oriental: 'Orientală',
  trompeta: 'Cu trompetă', romantica: 'De jale', comerciala: 'Comercială',
  opulenta: 'De opulență', iubire: 'De iubire', tallava: 'Tallava',
  kuchek: 'Kuchek', trapanele: 'Trapanele', pahar: 'De pahar',
};

const VOICE_LABELS: Record<string, string> = {
  florinel: 'Florinel de Aur', adi: 'Adi Șampanie', ticu: 'Țicu Diamante',
  mariana: 'Mariana Trandafir', nicu: 'Nicu Mercedes', gigi: 'Gigi Cash',
};

function resolveStyleLabel(site: SiteDto | null, key: string): string {
  const fromSite = site?.styles?.find((s) => s.id === key)?.nm;
  return fromSite || STYLE_LABELS[key] || key;
}

function resolveVoiceLabel(site: SiteDto | null, key: string): string {
  const fromSite = site?.voices?.find((v) => v.id === key)?.nm;
  return fromSite || VOICE_LABELS[key] || key;
}

const COST_PER_SAMPLE = 10; // credite Suno aproximative

export default function SiteSamplesPage() {
  const params = useParams<{ id: string }>();
  const siteId = params.id;
  const { toast } = useToast();

  const [site, setSite] = useState<SiteDto | null>(null);
  const [data, setData] = useState<SamplesListDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([
        SitesApi.get(siteId),
        SitesApi.listSamples(siteId),
      ]);
      setSite(s);
      setData(d);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare', description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }, [siteId, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Refresh trigger din copii (ex: SampleRow după upload manual).
  useEffect(() => {
    const onRefresh = () => { void refresh(); };
    window.addEventListener('mc:samples-refresh', onRefresh);
    return () => window.removeEventListener('mc:samples-refresh', onRefresh);
  }, [refresh]);

  // Polling soft cât timp ceva e în curs de generare — actualizează statusul
  // fără să forțeze utilizatorul să apese refresh.
  useEffect(() => {
    if (!data) return;
    const anyGenerating =
      data.styles.some((s) => s.generating) || data.voices.some((s) => s.generating);
    if (!anyGenerating) return;
    const t = setInterval(() => { void refresh(); }, 8000);
    return () => clearInterval(t);
  }, [data, refresh]);

  async function regenerateOne(
    kind: 'style' | 'voice',
    key: string,
    regenerate: boolean,
    overrides?: { voice?: string; lyrics?: string; customStylePrompt?: string; recipientName?: string },
  ) {
    setBusyKey(`${kind}-${key}`);
    // Optimistic: marchează ca "generating" în UI imediat.
    setData((d) => updateLocal(d, kind, key, (e) => ({ ...e, generating: true })));
    try {
      const res = await SitesApi.generateSample(siteId, { kind, key, regenerate, ...(overrides ?? {}) });
      toast({
        variant: 'success',
        title: res.reused ? 'Mostra exista deja' : 'Mostra generată',
        description: `${kind} = ${key}`,
      });
      await refresh();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare generare', description: (err as Error).message });
      setData((d) => updateLocal(d, kind, key, (e) => ({ ...e, generating: false })));
    } finally {
      setBusyKey(null);
    }
  }

  async function generateAllMissing() {
    if (!data) return;
    const missing = [
      ...data.styles.filter((s) => !s.entry).map((s) => s.key),
      ...data.voices.filter((v) => !v.entry).map((v) => v.key),
    ];
    if (missing.length === 0) {
      toast({ title: 'Nimic de făcut', description: 'Toate mostrele sunt deja generate.' });
      return;
    }
    const ok = await confirmDialog({
      title: `Generezi ${missing.length} mostre?`,
      description: `Cost estimat: ~${missing.length * COST_PER_SAMPLE} credite Suno (${missing.length} × ${COST_PER_SAMPLE}). Procesul rulează în background și durează ~3 min per mostră.`,
      confirmText: 'Da, generează',
    });
    if (!ok) return;
    try {
      const res = await SitesApi.generateAllSamples(siteId, { regenerate: false });
      toast({ variant: 'success', title: 'Pornite', description: `${res.count} mostre puse la coadă.` });
      await refresh();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare', description: (err as Error).message });
    }
  }

  async function regenerateAll() {
    if (!data) return;
    const total = data.styles.length + data.voices.length;
    const ok = await confirmDialog({
      title: `Regenerezi TOT (${total} mostre)?`,
      description: `ATENȚIE: cost estimat ~${total * COST_PER_SAMPLE} credite Suno. Mostrele existente vor fi suprascrise. Continui?`,
      confirmText: 'Da, regenerează tot',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      const res = await SitesApi.generateAllSamples(siteId, { regenerate: true });
      toast({ variant: 'success', title: 'Pornit regenerare', description: `${res.count} mostre.` });
      await refresh();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare', description: (err as Error).message });
    }
  }

  return (
    <>
      <PageHeader
        title={site ? `Mostre audio · ${site.name}` : 'Mostre audio'}
        description="Mostrele scurte (~20s) folosite de butoanele ► de pe carduri-le de stil și voce din /studio."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/sites">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4" />
                Înapoi
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={() => refresh()}>
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        }
      />

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {!loading && data && (
        <>
          <Card className="mb-4">
            <CardContent className="p-4 flex flex-wrap gap-3 items-center">
              <Button onClick={generateAllMissing} variant="default">
                <Wand2 className="h-4 w-4" />
                Generează toate cele lipsă
              </Button>
              <Button onClick={regenerateAll} variant="destructive">
                <RefreshCcw className="h-4 w-4" />
                Regenerează tot (costă credite!)
              </Button>
              <div className="text-xs text-muted-foreground ml-auto">
                Cost ~{COST_PER_SAMPLE} credite/mostră · 18 mostre/site = ~{18 * COST_PER_SAMPLE} credite
              </div>
            </CardContent>
          </Card>

          <SectionHeader
            icon={<Music2 className="h-4 w-4" />}
            title={`Stiluri (${data.styles.length})`}
          />
          <div className="grid gap-2 mb-6">
            {data.styles.map((s) => (
              <SampleRow
                key={s.key}
                site={site}
                siteId={siteId}
                kind="style"
                row={s}
                label={resolveStyleLabel(site, s.key)}
                busy={busyKey === `style-${s.key}`}
                onRegen={(regenerate, overrides) => regenerateOne('style', s.key, regenerate, overrides)}
              />
            ))}
          </div>

          <SectionHeader
            icon={<Mic2 className="h-4 w-4" />}
            title={`Voci (${data.voices.length})`}
          />
          <div className="grid gap-2">
            {data.voices.map((v) => (
              <SampleRow
                key={v.key}
                site={site}
                siteId={siteId}
                kind="voice"
                row={v}
                label={resolveVoiceLabel(site, v.key)}
                busy={busyKey === `voice-${v.key}`}
                onRegen={(regenerate, overrides) => regenerateOne('voice', v.key, regenerate, overrides)}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function updateLocal(
  d: SamplesListDto | null,
  kind: 'style' | 'voice',
  key: string,
  patch: (s: SampleStatusDto) => SampleStatusDto,
): SamplesListDto | null {
  if (!d) return d;
  const k = kind === 'style' ? 'styles' : 'voices';
  return {
    ...d,
    [k]: d[k].map((s) => (s.key === key ? patch(s) : s)),
  } as SamplesListDto;
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
      {icon}
      {title}
    </div>
  );
}

type Overrides = { voice?: string; lyrics?: string; customStylePrompt?: string; recipientName?: string };

const DEFAULT_VOICE_KEYS = ['adi', 'florinel', 'ticu', 'mariana', 'nicu', 'gigi'] as const;

function SampleRow({
  site,
  siteId,
  kind,
  row,
  label,
  busy,
  onRegen,
}: {
  site: SiteDto | null;
  siteId: string;
  kind: 'style' | 'voice';
  row: SampleStatusDto;
  label: string;
  busy: boolean;
  onRegen: (regenerate: boolean, overrides?: Overrides) => void;
}) {
  const status: 'present' | 'generating' | 'missing' = row.generating || busy
    ? 'generating'
    : row.entry
      ? 'present'
      : 'missing';

  // Panel "Personalizează" — închis by default, expandabil per rând.
  const [open, setOpen] = useState(false);
  const voiceKeys = site?.voices?.length
    ? site.voices.map((v) => v.id)
    : (DEFAULT_VOICE_KEYS as readonly string[]);
  const defaultSunoPrompt =
    kind === 'style'
      ? site?.styles?.find((s) => s.id === row.key)?.sunoPrompt ?? site?.suno?.stylePromptMap?.[row.key] ?? ''
      : '';
  const defaultVoice = kind === 'voice' ? row.key : (voiceKeys[0] ?? 'adi');

  const [recipient, setRecipient] = useState('Demo');
  const [voice, setVoice] = useState(defaultVoice);
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Două câmpuri SEPARATE:
  //  - aiHint   → trimis la OpenAI ca "STIL MUZICAL" în user prompt (influențează vocabular/ritmul versurilor)
  //  - sunoPrompt → trimis la Suno ca override pentru stylePromptMap[key] (influențează genul muzical generat)
  const [aiHint, setAiHint] = useState('');
  const [sunoPrompt, setSunoPrompt] = useState(defaultSunoPrompt);
  const [lyrics, setLyrics] = useState('');
  const [lyricsBusy, setLyricsBusy] = useState(false);
  const { toast: rowToast } = useToast();

  // Sincronizează default-ul când site-ul se schimbă (refresh după save).
  useEffect(() => {
    setSunoPrompt(defaultSunoPrompt);
  }, [defaultSunoPrompt]);

  async function generateLyricsWithAI() {
    setLyricsBusy(true);
    try {
      const res = await SitesApi.previewSampleLyrics(siteId, {
        kind,
        key: row.key,
        voice: voice || undefined,
        recipientName: recipient || undefined,
        // Trimite hint-ul AI (text liber pentru vocabular/temă/ritmul versurilor).
        // Fallback la sunoPrompt dacă userul nu a scris hint AI separat (fluxul vechi).
        customStylePrompt: aiHint.trim() || sunoPrompt.trim() || undefined,
      });
      setLyrics(res.lyrics);
      rowToast({ variant: 'success', title: 'Lyrics generate', description: 'Editează în textarea înainte să generezi audio.' });
    } catch (err) {
      rowToast({ variant: 'destructive', title: 'Eroare AI', description: (err as Error).message });
    } finally {
      setLyricsBusy(false);
    }
  }

  async function handleUpload(file: File) {
    setUploadBusy(true);
    try {
      await SitesApi.uploadSample(siteId, kind, row.key, file);
      rowToast({ variant: 'success', title: 'Mostra încărcată', description: `${file.name} (${Math.round(file.size / 1024)} KB)` });
      // Trigger refresh prin onRegen cu un overrides dummy nu merge — apelăm direct refresh-ul prin event.
      // Hack simplu: dispatchEvent ca să forțăm refresh-ul din parent (în loc de prop drilling).
      window.dispatchEvent(new CustomEvent('mc:samples-refresh'));
    } catch (err) {
      rowToast({ variant: 'destructive', title: 'Upload eșuat', description: (err as Error).message });
    } finally {
      setUploadBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function submitCustom(regenerate: boolean) {
    const overrides: Overrides = {};
    if (voice && voice !== defaultVoice) overrides.voice = voice;
    if (lyrics.trim()) overrides.lyrics = lyrics.trim();
    // sunoPrompt = override explicit pentru music generation. Doar dacă userul l-a modificat.
    if (sunoPrompt.trim() && sunoPrompt !== defaultSunoPrompt) {
      overrides.customStylePrompt = sunoPrompt.trim();
    }
    if (recipient && recipient !== 'Demo') overrides.recipientName = recipient;
    const hasAny = Object.keys(overrides).length > 0;
    onRegen(regenerate, hasAny ? overrides : undefined);
  }

  return (
    <Card className={status === 'missing' ? 'border-amber-500/40' : ''}>
      <CardContent className="p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-32 shrink-0">
            <div className="font-medium text-sm">{label}</div>
            <code className="text-xs text-muted-foreground">{row.key}</code>
          </div>

          <StatusBadge status={status} />

          <div className="flex-1 min-w-[200px]">
            {row.entry ? (
              <audio
                controls
                src={row.entry.audioUrl}
                className="w-full h-8"
                preload="none"
                style={{ maxWidth: 320 }}
              />
            ) : (
              <span className="text-xs text-muted-foreground italic">Mostra nu a fost încă generată</span>
            )}
          </div>

          <div className="text-xs text-muted-foreground w-32 shrink-0">
            {row.entry?.generatedAt ? new Date(row.entry.generatedAt).toLocaleString() : '—'}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,audio/ogg,.mp3,.wav,.m4a,.ogg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadBusy}
            title="Upload manual (MP3/WAV/M4A/OGG, max 25MB) — fără credit Suno"
          >
            {uploadBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            Upload
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOpen((o) => !o)}
            title="Personalizează (voce, prompt, lyrics)"
          >
            <Settings2 className="h-3 w-3" />
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>

          <Button
            size="sm"
            variant={row.entry ? 'outline' : 'default'}
            onClick={() => onRegen(!!row.entry)}
            disabled={busy || row.generating}
            title={row.entry ? `Regenerează rapid (default — ${kind}=${row.key})` : `Generează rapid (default)`}
          >
            {busy || row.generating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : row.entry ? (
              <RefreshCcw className="h-3 w-3" />
            ) : (
              <Wand2 className="h-3 w-3" />
            )}
            {row.entry ? 'Regenerează' : 'Generează'}
          </Button>
        </div>

        {open && (
          <div className="mt-3 pt-3 border-t border-border space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs font-medium block mb-1">Nume destinatar (în lyrics)</label>
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm"
                  placeholder="Demo"
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">
                  Voce {kind === 'voice' && <span className="text-muted-foreground">(implicit = key-ul, dar poți schimba)</span>}
                </label>
                <select
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm"
                >
                  {voiceKeys.map((v) => {
                    const cfg = site?.voices?.find((sv) => sv.id === v);
                    const target = cfg?.sunoVoice ?? site?.suno?.voiceMap?.[v];
                    return (
                      <option key={v} value={v}>
                        {v}{target ? ` → ${target}` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1">
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-violet-400" />
                  Prompt pentru AI (versuri) <span className="text-muted-foreground font-normal">— opțional, doar la „Generează cu AI"</span>
                </span>
              </label>
              <textarea
                value={aiHint}
                onChange={(e) => setAiHint(e.target.value)}
                rows={3}
                className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm"
                placeholder={`Ex: "manea de jale despre dor, vocabular cu lacrimi/inimă/durere, ritm liric lent, fără șmecher". Lasă gol = AI folosește writerSystemPrompt-ul site-ului + prompt-ul Suno de mai jos ca hint.`}
              />
              <div className="text-[10px] text-muted-foreground mt-1">
                Influențează DOAR vocabularul și tema versurilor generate de OpenAI. NU ajunge la Suno.
              </div>
            </div>

            {kind === 'style' && (
              <div>
                <label className="text-xs font-medium block mb-1">
                  <span className="inline-flex items-center gap-1.5">
                    <Music2 className="h-3 w-3 text-amber-400" />
                    Prompt pentru Suno (muzică) <span className="text-muted-foreground font-normal">— override pentru <code>{row.key}</code></span>
                  </span>
                </label>
                <textarea
                  value={sunoPrompt}
                  onChange={(e) => setSunoPrompt(e.target.value)}
                  rows={3}
                  className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm font-mono"
                  placeholder={`Default: site.suno.stylePromptMap[${row.key}]`}
                />
                <div className="text-[10px] text-muted-foreground mt-1">
                  Influențează DOAR genul muzical generat de Suno (instrumentație, BPM, scală, vocal style).
                  Schimbarea aici NU se salvează în site — e doar pentru această generare. Pentru permanent, editează din /sites/{siteId}.
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium">Lyrics (Suno tags inclusive)</label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={generateLyricsWithAI}
                  disabled={lyricsBusy}
                  className="h-7"
                >
                  {lyricsBusy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Generează cu AI
                </Button>
              </div>
              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                rows={8}
                className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-xs font-mono"
                placeholder={`Lasă gol = demo lyrics auto în limba site-ului (${site?.locale ?? '?'}). Sau apasă „Generează cu AI" pentru lyrics nativ generat de OpenAI cu writerSystemPrompt-ul site-ului.`}
              />
            </div>

            <div className="flex items-center gap-2 justify-end">
              <Button
                size="sm"
                variant="default"
                onClick={() => submitCustom(true)}
                disabled={busy || row.generating}
              >
                {busy || row.generating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Wand2 className="h-3 w-3" />
                )}
                Generează cu opțiunile de mai sus
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: 'present' | 'generating' | 'missing' }) {
  if (status === 'present') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        Generated
      </span>
    );
  }
  if (status === 'generating') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-sky-500/15 text-sky-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        Generating
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-400">
      <AlertTriangle className="h-3 w-3" />
      Missing
    </span>
  );
}
