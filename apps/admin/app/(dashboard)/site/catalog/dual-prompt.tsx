'use client';

import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/cn';
import type { MusicEngine } from './types';

export function PromptPills({
  suno,
  google,
  engine,
}: {
  suno?: string;
  google?: string;
  engine: MusicEngine;
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <PromptPill label="Suno" filled={!!suno?.trim()} active={engine === 'suno'} />
      <PromptPill label="Lyria" filled={!!google?.trim()} active={engine === 'google'} />
    </div>
  );
}

function PromptPill({
  label,
  filled,
  active,
}: {
  label: string;
  filled: boolean;
  active: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium',
        active && 'bg-primary/15 text-primary',
        !active && filled && 'bg-emerald-500/15 text-emerald-400',
        !active && !filled && 'bg-amber-500/15 text-amber-400',
      )}
    >
      {label}
      {!filled && <span className="font-normal opacity-80">lipsă</span>}
    </span>
  );
}

export function DualPrompt({
  engine,
  suno,
  google,
  onSuno,
  onGoogle,
  sunoHelp,
  googleHelp,
  sunoPlaceholder,
  googlePlaceholder,
  sunoRows = 5,
  googleRows = 5,
  sunoFieldId,
  googleFieldId,
}: {
  engine: MusicEngine;
  suno: string;
  google: string;
  onSuno: (v: string) => void;
  onGoogle: (v: string) => void;
  sunoHelp?: string;
  googleHelp?: string;
  sunoPlaceholder?: string;
  googlePlaceholder?: string;
  sunoRows?: number;
  googleRows?: number;
  sunoFieldId?: string;
  googleFieldId?: string;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <PromptColumn
        title="Sursă Suno"
        help={sunoHelp ?? 'Tag-uri pentru Suno. Ex: manele, accordion, talger.'}
        active={engine === 'suno'}
        value={suno}
        onChange={onSuno}
        placeholder={sunoPlaceholder ?? 'manele, accordion, talger'}
        rows={sunoRows}
        fieldId={sunoFieldId}
      />
      <PromptColumn
        title="Sursă Google"
        help={googleHelp ?? 'Limbaj natural pentru Lyria: gen, instrumente, tempo, dispoziție.'}
        active={engine === 'google'}
        value={google}
        onChange={onGoogle}
        placeholder={googlePlaceholder ?? 'Gen, instrumente, BPM, mood.'}
        rows={googleRows}
        fieldId={googleFieldId}
      />
    </div>
  );
}

function PromptColumn({
  title,
  help,
  active,
  value,
  onChange,
  placeholder,
  rows,
  fieldId,
}: {
  title: string;
  help: string;
  active: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows: number;
  fieldId?: string;
}) {
  return (
    <div
      data-field={fieldId}
      className={cn(
        'rounded-lg border p-3 space-y-2 scroll-mt-24',
        active ? 'ring-1 ring-primary/40 bg-primary/5 border-primary/30' : 'border-border opacity-90',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        {active && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/15 text-primary">motor activ</span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">{help}</p>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="font-mono text-xs"
      />
    </div>
  );
}
