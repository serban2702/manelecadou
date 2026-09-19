'use client';

import { RotateCcw, Sparkles } from 'lucide-react';
import type { LyricsModelConfig } from '@/lib/api/sites.api';
import type { OpenAiModelCaps, OpenAiModelOption } from '@/lib/api/playground.api';
import { cn } from '@/lib/cn';

/**
 * Editorul setărilor unui model OpenAI pentru un pas al pipeline-ului de versuri
 * (scriitor / editor). Folosit în `/site` → Generare (setările salvate) și în
 * `/site/playground` (override pentru un test) — același component, ca ce
 * poți regla să fie identic în ambele locuri.
 *
 * Câmpurile neaplicabile modelului ales se ASCUND (nu doar se ignoră la
 * trimitere): `caps` vine din API (`modelCapabilities`, verificat empiric),
 * deci lista de effort, temperatura, verbosity etc. sunt exact ce acceptă
 * modelul apelat. Fără listă (model scris de mână), arătăm tot și lăsăm
 * API-ul să traducă/omită.
 *
 * `value === undefined` (sau fără nicio cheie) = comportamentul de dinainte:
 * `OPENAI_MODEL` global, pe calea veche, fără effort explicit.
 */

/** Recomandările din 19 sept 2026 (vezi CLAUDE.md §19 / task versuri). */
export const RECOMMENDED_WRITER: LyricsModelConfig = {
  model: 'gpt-5.6-terra',
  effort: 'medium',
  verbosity: 'medium',
  textFormat: 'text',
  reasoningSummary: 'off',
  store: false,
};
export const RECOMMENDED_CRITIC: LyricsModelConfig = { ...RECOMMENDED_WRITER, effort: 'high' };

const ALL_CAPS: OpenAiModelCaps = {
  reasoning: true,
  efforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
  temperature: true,
  verbosity: true,
  summary: true,
  proMode: true,
  responsesOnlyForTools: true,
};

const EFFORT_LABELS: Record<string, string> = {
  none: 'none — fără raționament',
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'max',
};

/** Există măcar o cheie completată? (Doar `model` nu schimbă calea de apel.) */
export function modelConfigIsEmpty(v: LyricsModelConfig | undefined | null): boolean {
  if (!v) return true;
  return !Object.values(v).some((x) => x !== undefined && x !== null && x !== '');
}

function hasTuning(v: LyricsModelConfig | undefined): boolean {
  if (!v) return false;
  const { model: _m, ...rest } = v;
  return !modelConfigIsEmpty(rest);
}

export function ModelConfigEditor({
  title,
  value,
  onChange,
  options,
  globalModel,
  preset,
  disabled,
  compact,
}: {
  title: string;
  value: LyricsModelConfig | undefined;
  onChange: (v: LyricsModelConfig | undefined) => void;
  options: OpenAiModelOption[];
  /** `OPENAI_MODEL` din setări — ce se folosește când `model` e gol. */
  globalModel?: string;
  /** Recomandarea pentru acest pas; butonul „Aplică recomandarea”. */
  preset?: LyricsModelConfig;
  disabled?: boolean;
  compact?: boolean;
}) {
  const v: LyricsModelConfig = value ?? {};
  const effective = (v.model ?? '').trim() || (globalModel ?? '').trim();
  const known = options.find((o) => o.id === effective);
  const caps: OpenAiModelCaps = known?.caps ?? (effective ? ALL_CAPS : ALL_CAPS);
  const groups = [...new Set(options.map((o) => o.group))];
  const customModel = !!v.model && !options.some((o) => o.id === v.model);

  function set(patch: Partial<LyricsModelConfig>) {
    const next: LyricsModelConfig = { ...v, ...patch };
    // Cheile goale se scot, ca „gol” să rămână chiar gol (= comportamentul vechi).
    for (const k of Object.keys(next) as Array<keyof LyricsModelConfig>) {
      const x = next[k];
      if (x === undefined || x === null || x === '') delete next[k];
    }
    onChange(Object.keys(next).length ? next : undefined);
  }

  function setModel(model: string) {
    // La schimbarea modelului scoatem setările pe care noul model nu le acceptă —
    // altfel ar rămâne invizibile în UI, dar trimise (și respinse) de API.
    const next: LyricsModelConfig = { ...v, model: model || undefined };
    const nextCaps = options.find((o) => o.id === (model || globalModel))?.caps ?? ALL_CAPS;
    if (next.effort && !nextCaps.efforts.includes(next.effort)) delete next.effort;
    if (!nextCaps.temperature) delete next.temperature;
    if (!nextCaps.verbosity) delete next.verbosity;
    if (!nextCaps.summary) delete next.reasoningSummary;
    if (!nextCaps.proMode) delete next.reasoningMode;
    set(next);
    if (!model && !hasTuning(next)) onChange(undefined);
  }

  const empty = modelConfigIsEmpty(v);
  const tuned = hasTuning(v);

  return (
    <div className={cn('space-y-3', disabled && 'opacity-60 pointer-events-none')}>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-sm font-semibold">{title}</div>
        <span
          className={cn(
            'text-[10px] px-1.5 py-0.5 rounded border',
            empty
              ? 'border-border text-muted-foreground'
              : tuned
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-600',
          )}
          title={
            empty
              ? 'Nicio setare: se folosește OPENAI_MODEL global, pe calea veche (chat/completions), fără effort explicit.'
              : tuned
                ? 'Cu reglaje: cererea pleacă pe /v1/responses cu parametrii de mai jos.'
                : 'Doar modelul e schimbat: calea veche (chat/completions), fără effort explicit.'
          }
        >
          {empty ? 'implicit (ca azi)' : tuned ? 'reglat · /v1/responses' : 'doar model · chat/completions'}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {preset && (
            <button
              type="button"
              onClick={() => onChange({ ...preset })}
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              title={`${preset.model} · effort ${preset.effort} · verbosity ${preset.verbosity}`}
            >
              <Sparkles className="h-3 w-3" /> Aplică recomandarea
            </button>
          )}
          {!empty && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              title="Șterge toate setările — revine la comportamentul global"
            >
              <RotateCcw className="h-3 w-3" /> Resetează
            </button>
          )}
        </span>
      </div>

      <div className={cn('grid gap-3', compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3')}>
        <Field label="Model" hint={v.model ? undefined : `global: ${globalModel || '—'}`} className="sm:col-span-2 lg:col-span-1">
          <select
            value={v.model ?? ''}
            onChange={(e) => setModel(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">Global (OPENAI_MODEL{globalModel ? `: ${globalModel}` : ''})</option>
            {customModel && <option value={v.model}>{v.model} (scris manual)</option>}
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {options
                  .filter((o) => o.group === g)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </Field>

        {caps.reasoning && caps.efforts.length > 0 && (
          <Field label="Reasoning effort" hint="cât raționează înainte să scrie">
            <select
              value={v.effort ?? ''}
              onChange={(e) => set({ effort: e.target.value || undefined })}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">implicit (modelul decide)</option>
              {caps.efforts.map((e) => (
                <option key={e} value={e}>
                  {EFFORT_LABELS[e] ?? e}
                </option>
              ))}
            </select>
          </Field>
        )}

        {caps.proMode && (
          <Field label="Reasoning mode" hint="pro = mai lent, mai scump">
            <select
              value={v.reasoningMode ?? ''}
              onChange={(e) => set({ reasoningMode: (e.target.value || undefined) as LyricsModelConfig['reasoningMode'] })}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">standard (implicit)</option>
              <option value="pro">pro</option>
            </select>
          </Field>
        )}

        {caps.verbosity && (
          <Field label="Verbosity" hint="low riscă strofe scurte">
            <select
              value={v.verbosity ?? ''}
              onChange={(e) => set({ verbosity: (e.target.value || undefined) as LyricsModelConfig['verbosity'] })}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">implicit (medium)</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </Field>
        )}

        {caps.temperature && (
          <Field
            label={`Temperatură${typeof v.temperature === 'number' ? ` · ${v.temperature.toFixed(2)}` : ''}`}
            hint={typeof v.temperature === 'number' ? '0 = factual, 1+ = creativ' : 'implicit: 0.85 pe calea veche'}
          >
            <div className="flex items-center gap-2 h-9">
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.05}
                value={typeof v.temperature === 'number' ? v.temperature : 0.85}
                onChange={(e) => set({ temperature: Number(e.target.value) })}
                className="w-full accent-[hsl(var(--primary))]"
              />
              {typeof v.temperature === 'number' && (
                <button
                  type="button"
                  onClick={() => set({ temperature: undefined })}
                  className="text-[11px] text-muted-foreground hover:text-foreground shrink-0"
                  title="Fără temperatură explicită"
                >
                  implicit
                </button>
              )}
            </div>
          </Field>
        )}

        {caps.summary && (
          <Field label="Reasoning summary" hint="rezumatul raționamentului, în răspuns">
            <select
              value={v.reasoningSummary ?? ''}
              onChange={(e) =>
                set({ reasoningSummary: (e.target.value || undefined) as LyricsModelConfig['reasoningSummary'] })
              }
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">dezactivat (implicit)</option>
              <option value="auto">auto</option>
              <option value="concise">concise</option>
              <option value="detailed">detailed</option>
            </select>
          </Field>
        )}

        <Field label="Format text" hint="versurile sunt text simplu">
          <select
            value={v.textFormat ?? ''}
            onChange={(e) => set({ textFormat: (e.target.value || undefined) as LyricsModelConfig['textFormat'] })}
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">text (implicit)</option>
            <option value="text">text</option>
            <option value="json_object">json_object</option>
          </select>
        </Field>

        <Field label="Store (loguri la OpenAI)" hint="OFF: payload-ul conține nume reale">
          <label className="flex items-center gap-2 h-9 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={v.store === true}
              onChange={(e) => set({ store: e.target.checked ? true : undefined })}
              className="accent-[hsl(var(--primary))]"
            />
            <span className="text-xs text-muted-foreground">{v.store ? 'pornit — cererile rămân stocate la OpenAI' : 'oprit (implicit)'}</span>
          </label>
        </Field>
      </div>
    </div>
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
    <div className={cn('space-y-1 min-w-0', className)}>
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-xs font-medium shrink-0">{label}</span>
        {hint && <span className="text-[11px] text-muted-foreground truncate">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
