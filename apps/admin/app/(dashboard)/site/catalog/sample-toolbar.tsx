'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCcw,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
  SitesApi,
  type SampleStatusDto,
  type SiteDto,
  type SiteSampleDefaults,
} from '@/lib/api/sites.api';
import { Field, Toggle } from '../studio-primitives';
import type { GenerateOverrides, SampleKind, SampleStatus } from './types';

export function sampleStatusOf(sample: SampleStatusDto | null, busy: boolean): SampleStatus {
  if (!sample) return 'missing';
  if (sample.generating || busy) return 'generating';
  return sample.entry ? 'present' : 'missing';
}

export function SampleStatusBadge({ status }: { status: SampleStatus }) {
  if (status === 'present') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
        <CheckCircle2 className="h-2.5 w-2.5" />
        OK
      </span>
    );
  }
  if (status === 'generating') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        gen
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
      <AlertTriangle className="h-2.5 w-2.5" />
      lipsă
    </span>
  );
}

export function SampleMiniPlayer({ sample, busy }: { sample: SampleStatusDto | null; busy: boolean }) {
  const status = sampleStatusOf(sample, busy);
  if (status === 'generating') {
    return (
      <span className="text-[11px] text-sky-400 italic inline-flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        se generează…
      </span>
    );
  }
  if (sample?.entry) {
    return <audio controls src={sample.entry.audioUrl} className="w-full h-7" preload="metadata" />;
  }
  return <span className="text-[11px] text-muted-foreground italic">fără mostră</span>;
}

export function SampleToolbar({
  kind,
  entryId,
  sample,
  busy,
  site,
  siteId,
  sampleDefaults,
  lyricsHint,
  sunoPrompt,
  voiceKeys,
  onUpdateDefaults,
  onGenerate,
  onUpload,
  onUpdateStartSec,
}: {
  kind: SampleKind;
  entryId: string;
  sample: SampleStatusDto | null;
  busy: boolean;
  site: SiteDto;
  siteId: string;
  sampleDefaults: SiteSampleDefaults;
  lyricsHint?: string;
  sunoPrompt?: string;
  voiceKeys: string[];
  onUpdateDefaults: (patch: Partial<SiteSampleDefaults>) => void;
  onGenerate: (regenerate: boolean, overrides?: GenerateOverrides) => void;
  onUpload: (file: File) => void;
  onUpdateStartSec: (sec: number) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [lyricsBusy, setLyricsBusy] = useState(false);
  const { toast } = useToast();
  const status = sampleStatusOf(sample, busy);
  const sd = sampleDefaults;

  const recipient = sd.recipient ?? 'Andrei';
  const dedication = sd.dedication ?? '';
  const voiceOverride = sd.voice ?? '';
  const styleOverride = sd.style ?? '';
  const occasionOverride = sd.occasion ?? (site.occasions?.[0]?.id ?? '');
  const messageDraft = sd.message ?? '';
  const premiumDraft = sd.premium ?? false;
  const genderOverride: '' | 'm' | 'f' = sd.gender ?? '';
  const aiHint = sd.aiHint ?? lyricsHint ?? '';
  const sunoPromptDraft = sd.sunoPromptDraft ?? sunoPrompt ?? '';
  const lyrics = sd.lyrics ?? '';


  function buildOverrides(): GenerateOverrides | undefined {
    const overrides: GenerateOverrides = {};
    if (voiceOverride) overrides.voice = voiceOverride;
    if (kind === 'voice') overrides.voice = entryId;
    if (lyrics.trim()) overrides.lyrics = lyrics.trim();
    if (kind === 'style' && sunoPromptDraft.trim() && sunoPromptDraft !== (sunoPrompt ?? '')) {
      overrides.customStylePrompt = sunoPromptDraft.trim();
    }
    if (recipient.trim()) overrides.recipientName = recipient.trim();
    if (dedication.trim()) overrides.dedication = dedication.trim();
    if (styleOverride) overrides.style = styleOverride;
    if (occasionOverride) overrides.occasion = occasionOverride;
    if (messageDraft.trim()) overrides.message = messageDraft.trim();
    if (premiumDraft) overrides.premium = true;
    if (genderOverride) overrides.vocalGender = genderOverride;
    return Object.keys(overrides).length > 0 ? overrides : undefined;
  }

  function submitGenerate(regenerate: boolean) {
    onGenerate(regenerate, buildOverrides());
  }

  async function generateLyricsWithAI() {
    setLyricsBusy(true);
    try {
      const res = await SitesApi.previewSampleLyrics(siteId, {
        kind,
        key: entryId,
        voice: voiceOverride || (kind === 'voice' ? entryId : undefined),
        recipientName: recipient || undefined,
        dedication: dedication.trim() || undefined,
        customStylePrompt: aiHint.trim() || sunoPromptDraft.trim() || undefined,
        style: styleOverride || undefined,
        occasion: occasionOverride || undefined,
        message: messageDraft.trim() || undefined,
      });
      onUpdateDefaults({ lyrics: res.lyrics });
      toast({ variant: 'success', title: 'Lyrics generate', description: 'Editează apoi „Generează audio".' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare AI', description: (err as Error).message });
    } finally {
      setLyricsBusy(false);
    }
  }

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Mostră audio</div>
      <div className="flex items-center gap-2 flex-wrap">
        <SampleStatusBadge status={status} />
        <div className="flex-1 min-w-[160px]">
          <SampleMiniPlayer sample={sample} busy={busy} />
        </div>
        {sample?.entry && (
          <SampleStartSecInput
            audioUrl={sample.entry.audioUrl}
            value={sample.entry.startSec ?? 0}
            onCommit={onUpdateStartSec}
          />
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,audio/ogg,.mp3,.wav,.m4a,.ogg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />
        <Button size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()} title="Upload manual">
          <Upload className="h-3 w-3" />
        </Button>
        <Button
          size="sm"
          variant={sample?.entry ? 'outline' : 'default'}
          onClick={() => submitGenerate(!!sample?.entry)}
          disabled={busy || !!sample?.generating}
          title={sample?.entry ? 'Regenerează cu opțiunile salvate' : 'Generează cu opțiunile salvate'}
        >
          {busy || sample?.generating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : sample?.entry ? (
            <RefreshCcw className="h-3 w-3" />
          ) : (
            <Wand2 className="h-3 w-3" />
          )}
        </Button>
      </div>

      <details className="rounded-md border border-dashed border-border/70 bg-background/40">
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium">
          Personalizează mostra
          <span className="ml-1 font-normal text-muted-foreground">(aceleași câmpuri ca pe site)</span>
        </summary>
        <div className="space-y-2 border-t border-border px-3 pb-3 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label="Nume destinatar (în lyrics)">
              <Input
                value={recipient}
                onChange={(e) => onUpdateDefaults({ recipient: e.target.value })}
                placeholder="Ex: Andrei, Mariana, Costel..."
              />
            </Field>
            {kind === 'style' && (
              <Field label="Voce override (gol = default)">
                <select
                  value={voiceOverride}
                  onChange={(e) => onUpdateDefaults({ voice: e.target.value || undefined })}
                  className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm"
                >
                  <option value="">— default —</option>
                  {voiceKeys.map((v) => (
                    <option key={v} value={v}>
                      {v === 'male' ? 'Bărbătească' : v === 'female' ? 'Feminină' : v}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {kind === 'voice' && (
              <Field label="Stil (pentru mostră)">
                <select
                  value={styleOverride}
                  onChange={(e) => onUpdateDefaults({ style: e.target.value || undefined })}
                  className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm"
                >
                  <option value="">— default —</option>
                  {(site.styles ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nm || s.id}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Ocazie">
              <select
                value={occasionOverride}
                onChange={(e) => onUpdateDefaults({ occasion: e.target.value || undefined })}
                className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm"
              >
                <option value="">— nespecificat —</option>
                {(site.occasions ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nm || o.id}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Registru vocal">
              <select
                value={genderOverride}
                onChange={(e) => {
                  const v = e.target.value;
                  onUpdateDefaults({ gender: v === 'm' || v === 'f' ? v : undefined });
                }}
                className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm"
              >
                <option value="">— default voce —</option>
                <option value="m">Masculin</option>
                <option value="f">Feminin</option>
              </select>
            </Field>
          </div>

          <Field label="Dedicație — expeditor (opțional)">
            <Input
              value={dedication}
              onChange={(e) => onUpdateDefaults({ dedication: e.target.value })}
              placeholder='Ex: "fratele tău Ionuț"'
            />
          </Field>

          <Field
            label="Mesaj personal pentru destinatar"
            description="Intră în promptul Suno și ca {{message}} la scriitorul de versuri."
          >
            <Textarea
              value={messageDraft}
              onChange={(e) => onUpdateDefaults({ message: e.target.value })}
              rows={2}
              placeholder="Ex: La mulți ani, șefule! Să dea Domnu' să luăm bonus de Crăciun..."
            />
          </Field>

          <Field label="Hint AI pentru versuri (opțional)">
            <Textarea
              value={aiHint}
              onChange={(e) => onUpdateDefaults({ aiHint: e.target.value })}
              rows={2}
              placeholder="Ex: manea de jale despre dor, vocabular cu lacrimi/inimă, ritm liric lent"
            />
          </Field>

          {kind === 'style' && (
            <Field label="Prompt Suno temporar (override pentru această mostră)">
              <Textarea
                value={sunoPromptDraft}
                onChange={(e) => onUpdateDefaults({ sunoPromptDraft: e.target.value })}
                rows={2}
              />
            </Field>
          )}

          <Toggle
            label="Premium (durată ~60s, calitate full în loc de demo 20s)"
            value={premiumDraft}
            onChange={(v) => onUpdateDefaults({ premium: v })}
          />

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Versuri (cu marcaje Suno)</Label>
              <Button size="sm" variant="ghost" onClick={() => void generateLyricsWithAI()} disabled={lyricsBusy} className="h-7">
                {lyricsBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Generează cu AI
              </Button>
            </div>
            <Textarea
              value={lyrics}
              onChange={(e) => onUpdateDefaults({ lyrics: e.target.value })}
              rows={6}
              className="font-mono text-xs"
              placeholder={`Lasă gol = demo auto în limba site-ului (${site.locale}).`}
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button size="sm" onClick={() => submitGenerate(true)} disabled={busy || !!sample?.generating}>
              {busy || sample?.generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
              Generează cu opțiunile de mai sus
            </Button>
          </div>
        </div>
      </details>
    </div>
  );
}

function SampleStartSecInput({
  audioUrl,
  value,
  onCommit,
}: {
  audioUrl: string;
  value: number;
  onCommit: (sec: number) => void;
}) {
  const [draft, setDraft] = useState<string>(String(Math.round(value * 10) / 10));
  useEffect(() => {
    setDraft(String(Math.round(value * 10) / 10));
  }, [value]);

  const commit = () => {
    const n = Math.max(0, Math.min(600, Number(draft) || 0));
    if (Math.abs(n - value) < 0.05) return;
    onCommit(n);
  };

  const grabFromPlayer = () => {
    const el = document.querySelector<HTMLAudioElement>(`audio[src="${audioUrl}"]`);
    if (!el) return;
    const sec = Math.round(el.currentTime * 10) / 10;
    setDraft(String(sec));
    onCommit(sec);
  };

  return (
    <div className="flex items-center gap-1" title="Secunda de la care începe playback-ul în site">
      <span className="text-[10px] text-muted-foreground">Start</span>
      <input
        type="number"
        min={0}
        max={600}
        step={0.5}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="w-14 h-7 rounded border border-input bg-background px-1 text-[11px] text-right"
      />
      <span className="text-[10px] text-muted-foreground">s</span>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={grabFromPlayer} title="Setează din player (currentTime)">
        ⤓
      </Button>
    </div>
  );
}
