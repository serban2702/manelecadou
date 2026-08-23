'use client';

import { useMemo, useRef } from 'react';
import type { SiteDto } from '@/lib/api/sites.api';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/cn';
import { currencySuffix } from '../money';
import {
  CRITIC_PLACEHOLDERS,
  PlaceholderChips,
  PromptPreview,
  WRITER_PLACEHOLDERS,
  insertPlaceholder,
} from '../fields/prompt-preview';
import { SpaLink } from '@/lib/spa-router';
import { LOCALES, LOCALE_LABELS } from '../studio-constants';
import { setStudioFocus } from '../studio-nav';
import { Field, StudioSection, Toggle } from '../studio-primitives';

function patchSuno(form: SiteDto, patch: Partial<SiteDto['suno']>): SiteDto {
  return { ...form, suno: { ...form.suno, ...patch } };
}

export function GenerationScreen({ form, setForm }: { form: SiteDto; setForm: (f: SiteDto) => void }) {
  const engine = form.musicEngine === 'google' ? 'google' : 'suno';
  const previewVars = useMemo(() => samplePreviewVars(form), [form]);

  return (
    <div className="grid gap-6">
      <StudioSection
        title="Motor default (tenant)"
        help="Fallback dacă interfața n-are motor propriu. Prompturile Suno/Google se scriu pe stil/ocazie, în Interfețe sau în Librărie."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-field="engine">
          <EngineCard
            active={engine === 'suno'}
            title="Suno"
            body="Un task întoarce 2 piese. Promptul de stil e listă de tag-uri (manele, accordion, talger)."
            onClick={() => setForm({ ...form, musicEngine: 'suno' })}
          />
          <EngineCard
            active={engine === 'google'}
            title="Google Lyria 3 Pro"
            body="2 variante generate în paralel. Promptul e limbaj natural (gen, instrumente, BPM, mood). Cheia Gemini e la Setări → Chei."
            onClick={() => setForm({ ...form, musicEngine: 'google' })}
          />
        </div>
      </StudioSection>

      <StudioSection
        title="Review versuri"
        help="Pas în wizard înainte de plată: clientul vede versurile, le acceptă sau cere modificări."
      >
        <Toggle
          label="Review versuri înainte de plată"
          fieldId="generation.review"
          description="ON: max 5 regenerări AI, apoi editare manuală. Versurile sunt validate (fără nume de artiști) și rescrise fonetic pentru Suno. OFF: se sare direct la plată."
          value={form.lyricsReviewEnabled ?? true}
          onChange={(v) => setForm({ ...form, lyricsReviewEnabled: v })}
        />
      </StudioSection>

      {engine === 'google' && (
        <StudioSection
          title="Prompturi Google Lyria"
          help="Nu există prompt global. Se scrie pe fiecare stil/ocazie, pe interfață (sau în Librărie dacă moștenește)."
        >
          <Card>
            <CardContent className="p-4 text-sm space-y-2">
              <p className="text-muted-foreground">
                Deschide un stil — coloana din dreapta e promptul Lyria. Motorul activ e evidențiat, celălalt rămâne editabil.
              </p>
              <SpaLink
                href="/site/interfaces"
                className="inline-flex text-sm text-primary hover:underline"
                onClick={() =>
                  setStudioFocus({
                    fieldId: 'catalog.style.googlePrompt',
                    catalogKind: 'styles',
                  })
                }
              >
                Deschide Interfețe →
              </SpaLink>
            </CardContent>
          </Card>
        </StudioSection>
      )}

      <StudioSection
        title="Prompt Suno de bază"
        help="Se lipește la fiecare generare Suno, înaintea promptului de stil. Gol = default-ul din API. La Lyria nu se folosește."
      >
        <Card className={cn(engine !== 'suno' && 'opacity-90')}>
          <CardContent className="p-4 space-y-3">
            <Field
              label="Prompt de bază Suno"
              fieldId="generation.basePrompt"
              description="Instrucțiunea globală, înaintea stilului. Ex: authentic manele, accordion, talger, male vocal."
            >
              <Textarea
                value={form.suno?.basePrompt ?? ''}
                onChange={(e) => setForm(patchSuno(form, { basePrompt: e.target.value }))}
                rows={3}
                placeholder="Lasă gol = default Suno."
                className="font-mono text-xs"
              />
            </Field>
          </CardContent>
        </Card>
      </StudioSection>

      <StudioSection
        title="Limbă versuri"
        help="Limba în care GPT scrie versurile. De obicei aceeași cu limba site-ului."
      >
        <Card>
          <CardContent className="p-4">
            <Field
              label="Limbă versuri"
              fieldId="generation.lyricsLocale"
              description={`Default = limba site-ului (${LOCALE_LABELS[form.locale as keyof typeof LOCALE_LABELS] ?? form.locale}).`}
            >
              <select
                value={form.suno?.lyricsLocale ?? form.locale}
                onChange={(e) => setForm(patchSuno(form, { lyricsLocale: e.target.value }))}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
              >
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {LOCALE_LABELS[l]} ({l})
                  </option>
                ))}
              </select>
            </Field>
          </CardContent>
        </Card>
      </StudioSection>

      <StudioSection
        title="Scriitor de versuri"
        help="GPT scrie ciorna. Gol = template-ul default RO. Click pe un placeholder ca să-l bagi în prompt."
      >
        <Card>
          <CardContent className="p-4 space-y-5">
            <PromptField
              label="Instrucțiuni pentru scriitorul de versuri"
              fieldId="generation.writer"
              description="Rolul GPT. Înlocuiește corpul default; limba de output e forțată separat."
              value={form.suno?.writerSystemPrompt ?? ''}
              onChange={(v) => setForm(patchSuno(form, { writerSystemPrompt: v }))}
              rows={6}
              tokens={WRITER_PLACEHOLDERS}
              placeholder="Lasă gol = default RO. Pentru BG: prompt pentru chalga; TR: arabesk."
            />
            <PromptField
              label="Cererea cu datele comenzii"
              fieldId="generation.writerUser"
              description="Textul trimis GPT, cu datele comenzii. Preview-ul de mai jos e un exemplu, nu o comandă reală."
              value={form.suno?.writerUserTemplate ?? ''}
              onChange={(v) => setForm(patchSuno(form, { writerUserTemplate: v }))}
              rows={10}
              tokens={WRITER_PLACEHOLDERS}
              previewVars={previewVars}
              placeholder={'Scrie versuri pentru o manea autentică, cu detaliile:\n- Stil: {{style}}\n- Destinatar: {{recipientName}}\n- Expeditor: {{senderName}}\n- Mesaj: {{message}}'}
            />
          </CardContent>
        </Card>
      </StudioSection>

      <StudioSection
        title="Editor de versuri"
        help="Al doilea pas GPT: rafinează ciorna. Are {{draft}} extra față de scriitor."
      >
        <Card>
          <CardContent className="p-4 space-y-5">
            <PromptField
              label="Instrucțiuni pentru editorul de versuri"
              fieldId="generation.critic"
              description="Păstrează numele, mesajul și marcajele [Verse]/[Chorus]."
              value={form.suno?.criticSystemPrompt ?? ''}
              onChange={(v) => setForm(patchSuno(form, { criticSystemPrompt: v }))}
              rows={5}
              tokens={CRITIC_PLACEHOLDERS}
              placeholder="Lasă gol = default. Păstrează numele destinatarului și marcajele [Verse]/[Chorus]."
            />
            <PromptField
              label="Cererea către editor (cu ciorna)"
              fieldId="generation.criticUser"
              description="Primește ciorna în {{draft}}. Preview cu un draft scurt de exemplu."
              value={form.suno?.criticUserTemplate ?? ''}
              onChange={(v) => setForm(patchSuno(form, { criticUserTemplate: v }))}
              rows={8}
              tokens={CRITIC_PLACEHOLDERS}
              previewVars={previewVars}
              placeholder={'Rafinează ciorna de mai jos.\nContext:\n- Destinatar: {{recipientName}}\n- Mesaj: {{message}}\nCiornă:\n{{draft}}'}
            />
          </CardContent>
        </Card>
      </StudioSection>
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
        active
          ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/40'
          : 'border-border hover:border-primary/30',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        {active && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/15 text-primary">
            activ
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{body}</p>
    </button>
  );
}

function PromptField({
  label,
  description,
  fieldId,
  value,
  onChange,
  rows,
  tokens,
  previewVars,
  placeholder,
}: {
  label: string;
  description?: string;
  fieldId?: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  tokens: readonly string[];
  previewVars?: Record<string, string>;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <Field label={label} description={description} fieldId={fieldId}>
      <PlaceholderChips
        tokens={tokens}
        onInsert={(token) => insertPlaceholder(ref.current, value, token, onChange)}
      />
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="font-mono text-xs"
      />
      {previewVars && (
        <div className="space-y-1">
          <div className="text-[11px] text-muted-foreground">Preview (exemplu interpolat)</div>
          <PromptPreview template={value} vars={previewVars} />
        </div>
      )}
    </Field>
  );
}

function samplePreviewVars(form: SiteDto): Record<string, string> {
  const style = form.styles?.[0];
  const occasion = form.occasions?.[0];
  const voice = form.voices?.[0];
  return {
    style: style?.nm || style?.id || 'clasic',
    occasion: occasion?.nm || occasion?.id || 'zi de naștere',
    recipientName: 'Mirela',
    senderName: 'Costel',
    tipAmount: '500',
    currency: currencySuffix(form.currency || 'RON'),
    message: 'La mulți ani cu sănătate',
    voiceArtist: voice?.nm || voice?.id || 'male',
    styleHint: style?.lyricsHint || style?.sunoPrompt || 'manele, accordion, talger',
    draft: '[Verse 1]\nDe la Costel, pentru Mirela, cu drag\nLa mulți ani cu sănătate\n[Chorus]\nMirela, Mirela, să trăiești',
  };
}
