'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { Search, X, Palette, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ICON_REGISTRY,
  ICON_CATEGORIES,
  ICON_BY_NAME,
  type SiteIconConfig,
} from '@/lib/icon-registry';

// ─── SVG renderer ─────────────────────────────────────────────────────────────
function renderIconNodes(
  nodes: [string, Record<string, string | number>][],
  fill?: string,
  stroke?: string,
  strokeWidth?: number,
  size = 24,
): React.ReactElement {
  const svgFill = fill ?? 'none';
  const svgStroke = stroke ?? 'currentColor';
  const sw = strokeWidth ?? 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={svgFill}
      stroke={svgStroke}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      {nodes.map(([tag, attrs], i) => {
        const { fill: nodeFill, ...rest } = attrs as Record<string, string>;
        const Tag = tag as 'path' | 'circle' | 'rect' | 'line' | 'polyline' | 'polygon' | 'ellipse';
        const resolvedFill =
          nodeFill === 'currentColor' ? (svgFill === 'none' ? svgStroke : svgFill) : nodeFill;
        return <Tag key={i} {...rest} {...(resolvedFill !== undefined ? { fill: resolvedFill } : {})} />;
      })}
    </svg>
  );
}

// ─── Public render helper (also used outside this file) ────────────────────
export function renderSiteIcon(
  config: SiteIconConfig,
  size = 24,
): React.ReactElement | null {
  const def = ICON_BY_NAME[config.name];
  if (!def) return null;
  return renderIconNodes(def.nodes, config.fill, config.stroke, config.strokeWidth, size);
}

// ─── Color presets ────────────────────────────────────────────────────────────
const FILL_PRESETS = [
  { label: 'Niciunul', value: 'none' },
  { label: 'Alb', value: '#ffffff' },
  { label: 'Negru', value: '#000000' },
  { label: 'Auriu', value: '#f59e0b' },
  { label: 'Roșu', value: '#ef4444' },
  { label: 'Roz', value: '#ec4899' },
  { label: 'Violet', value: '#8b5cf6' },
  { label: 'Albastru', value: '#3b82f6' },
  { label: 'Cyan', value: '#06b6d4' },
  { label: 'Verde', value: '#22c55e' },
  { label: 'Portocaliu', value: '#f97316' },
  { label: 'Personalizat', value: '__custom__' },
];

const STROKE_PRESETS = [
  { label: 'Curent', value: 'currentColor' },
  { label: 'Alb', value: '#ffffff' },
  { label: 'Negru', value: '#000000' },
  { label: 'Auriu', value: '#f59e0b' },
  { label: 'Roșu', value: '#ef4444' },
  { label: 'Roz', value: '#ec4899' },
  { label: 'Violet', value: '#8b5cf6' },
  { label: 'Albastru', value: '#3b82f6' },
  { label: 'Cyan', value: '#06b6d4' },
  { label: 'Verde', value: '#22c55e' },
  { label: 'Portocaliu', value: '#f97316' },
  { label: 'Personalizat', value: '__custom__' },
];

// ─── ColorRow ─────────────────────────────────────────────────────────────────
function ColorRow({
  label,
  presets,
  value,
  onChange,
}: {
  label: string;
  presets: typeof FILL_PRESETS;
  value: string;
  onChange: (v: string) => void;
}) {
  const isCustom = !presets.some((p) => p.value === value) || value === '__custom__';
  const customRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const isSelected =
            p.value === '__custom__' ? isCustom : value === p.value;
          return (
            <button
              key={p.value}
              type="button"
              title={p.label}
              onClick={() => {
                if (p.value === '__custom__') {
                  customRef.current?.click();
                } else {
                  onChange(p.value);
                }
              }}
              className={`
                w-6 h-6 rounded-md border-2 transition-all duration-150
                ${isSelected ? 'border-primary scale-110 shadow-lg shadow-primary/20' : 'border-border hover:border-muted-foreground'}
                ${p.value === 'none' ? 'bg-transparent relative overflow-hidden' : ''}
                ${p.value === 'currentColor' ? 'bg-gradient-to-br from-slate-400 to-slate-600' : ''}
                ${p.value === '__custom__' ? 'bg-gradient-to-br from-red-400 via-yellow-400 to-blue-400' : ''}
              `}
              style={
                p.value !== 'none' &&
                p.value !== 'currentColor' &&
                p.value !== '__custom__'
                  ? { backgroundColor: p.value }
                  : undefined
              }
            >
              {p.value === 'none' && (
                <>
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-[1.5px] h-full bg-red-500 rotate-45 absolute" />
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
      {isCustom && (
        <div className="flex items-center gap-2 mt-1">
          <input
            ref={customRef}
            type="color"
            value={value === '__custom__' || value === 'none' || value === 'currentColor' ? '#ffffff' : value}
            onChange={(e) => onChange(e.target.value)}
            className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent p-0"
          />
          <Input
            value={value === '__custom__' ? '' : value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#rrggbb sau rgb(...)"
            className="h-7 text-xs font-mono flex-1"
          />
        </div>
      )}
    </div>
  );
}

// ─── Main IconPicker ───────────────────────────────────────────────────────────
interface IconPickerProps {
  value: SiteIconConfig | null;
  onChange: (v: SiteIconConfig | null) => void;
  size?: number;
}

export function IconPicker({ value, onChange, size = 20 }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<string>('all');

  // Working state inside picker
  const [draft, setDraft] = useState<SiteIconConfig | null>(null);

  function openPicker() {
    setDraft(value ? { ...value } : { name: '', fill: 'none', stroke: 'currentColor', strokeWidth: 2 });
    setOpen(true);
  }

  function apply() {
    if (draft?.name) onChange(draft);
    setOpen(false);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return ICON_REGISTRY.filter((ic) => {
      const matchCat = activeCat === 'all' || ic.cat === activeCat;
      const matchQ = !q || ic.label.toLowerCase().includes(q) || ic.name.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [query, activeCat]);

  const previewConfig = draft?.name
    ? { name: draft.name, fill: draft.fill, stroke: draft.stroke, strokeWidth: draft.strokeWidth }
    : null;
  const previewDef = previewConfig ? ICON_BY_NAME[previewConfig.name] : null;

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={openPicker}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-accent hover:border-primary/50 transition-all duration-150 min-w-[120px] group"
      >
        <span className="w-7 h-7 flex items-center justify-center rounded-md bg-secondary/50 group-hover:bg-primary/10 transition-colors">
          {value ? (
            renderSiteIcon(value, size)
          ) : (
            <Palette className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </span>
        <span className="text-xs text-muted-foreground flex-1 text-left">
          {value ? value.name : 'Alege icoana'}
        </span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
        {value && (
          <button
            type="button"
            onClick={clear}
            className="ml-0.5 hover:text-destructive transition-colors"
            title="Șterge icoana"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backdropFilter: 'blur(4px)', backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-secondary/20">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Palette className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Selector Icoană</h3>
                  <p className="text-xs text-muted-foreground">{ICON_REGISTRY.length} icoane disponibile</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col md:flex-row overflow-hidden flex-1 min-h-0">
              {/* Left panel: preview + controls */}
              <div className="w-full md:w-56 shrink-0 p-4 border-b md:border-b-0 md:border-r border-border bg-secondary/10 space-y-4 overflow-y-auto">
                {/* Preview */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Previzualizare</Label>
                  <div className="flex items-center justify-center h-20 rounded-xl border border-border bg-background/50">
                    {previewDef && draft ? (
                      renderIconNodes(previewDef.nodes, draft.fill, draft.stroke, draft.strokeWidth, 40)
                    ) : (
                      <span className="text-2xl text-muted-foreground/30">?</span>
                    )}
                  </div>
                  {previewDef && (
                    <p className="text-center text-xs text-muted-foreground truncate">{previewDef.label}</p>
                  )}
                </div>

                {/* Fill */}
                <ColorRow
                  label="Fill (umplere)"
                  presets={FILL_PRESETS}
                  value={draft?.fill ?? 'none'}
                  onChange={(v) => setDraft((d) => d ? { ...d, fill: v } : d)}
                />

                {/* Stroke */}
                <ColorRow
                  label="Stroke (contur)"
                  presets={STROKE_PRESETS}
                  value={draft?.stroke ?? 'currentColor'}
                  onChange={(v) => setDraft((d) => d ? { ...d, stroke: v } : d)}
                />

                {/* Stroke width */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Grosime contur
                    </Label>
                    <span className="text-xs font-mono text-primary">{draft?.strokeWidth ?? 2}px</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="3"
                    step="0.25"
                    value={draft?.strokeWidth ?? 2}
                    onChange={(e) => setDraft((d) => d ? { ...d, strokeWidth: parseFloat(e.target.value) } : d)}
                    className="w-full accent-primary cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>0.5</span><span>1.5</span><span>3</span>
                  </div>
                </div>

                {/* Apply */}
                <Button
                  size="sm"
                  className="w-full"
                  disabled={!draft?.name}
                  onClick={apply}
                >
                  Aplică icoana
                </Button>
              </div>

              {/* Right panel: search + grid */}
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                {/* Search */}
                <div className="px-4 pt-4 pb-2 border-b border-border/50">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Caută icoană..."
                      className="pl-9 h-8 text-sm"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Category chips */}
                <div className="flex gap-1.5 px-4 py-2 overflow-x-auto border-b border-border/50 no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setActiveCat('all')}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                      activeCat === 'all'
                        ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                        : 'bg-secondary hover:bg-secondary/80 text-muted-foreground'
                    }`}
                  >
                    Toate ({ICON_REGISTRY.length})
                  </button>
                  {ICON_CATEGORIES.map((cat) => {
                    const count = ICON_REGISTRY.filter((ic) => ic.cat === cat.id).length;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setActiveCat(cat.id)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                          activeCat === cat.id
                            ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                            : 'bg-secondary hover:bg-secondary/80 text-muted-foreground'
                        }`}
                      >
                        {cat.label} ({count})
                      </button>
                    );
                  })}
                </div>

                {/* Icon grid */}
                <div className="overflow-y-auto flex-1 p-3">
                  {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Search className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-sm">Nicio icoană găsită</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-8 gap-1.5">
                      {filtered.map((ic) => {
                        const isSelected = draft?.name === ic.name;
                        return (
                          <button
                            key={ic.name}
                            type="button"
                            title={ic.label}
                            onClick={() => setDraft((d) => d ? { ...d, name: ic.name } : { name: ic.name, fill: 'none', stroke: 'currentColor', strokeWidth: 2 })}
                            className={`
                              group relative w-full aspect-square flex items-center justify-center rounded-lg
                              transition-all duration-100
                              ${isSelected
                                ? 'bg-primary shadow-lg shadow-primary/30 scale-110'
                                : 'hover:bg-secondary/60 hover:scale-105'}
                            `}
                          >
                            <span
                              className={`transition-colors ${isSelected ? 'text-primary-foreground' : 'text-foreground/70 group-hover:text-foreground'}`}
                            >
                              {renderIconNodes(ic.nodes, undefined, undefined, 1.75, 18)}
                            </span>
                            {isSelected && (
                              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border border-background" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-border/50 flex items-center justify-between bg-secondary/10">
                  <span className="text-xs text-muted-foreground">
                    {filtered.length} din {ICON_REGISTRY.length} icoane
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
                      Anulează
                    </Button>
                    <Button size="sm" disabled={!draft?.name} onClick={apply}>
                      Aplică
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
