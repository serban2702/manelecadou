'use client';

import type { ReactNode } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export function StudioSection({
  title,
  help,
  children,
  className,
}: {
  title: string;
  help?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {help && <p className="mt-1 text-sm text-muted-foreground">{help}</p>}
      </div>
      {children}
    </section>
  );
}

export function SubSection({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight">{title}</div>
          {subtitle && <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Field({
  label,
  description,
  children,
  fieldId,
}: {
  label: string;
  description?: string;
  children: ReactNode;
  fieldId?: string;
}) {
  return (
    <div className="space-y-1 scroll-mt-24" data-field={fieldId}>
      <Label className="text-xs font-medium normal-case tracking-normal text-foreground">{label}</Label>
      {description && <p className="text-[11px] text-muted-foreground leading-snug">{description}</p>}
      {children}
    </div>
  );
}

export function Toggle({
  label,
  description,
  value,
  onChange,
  fieldId,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  fieldId?: string;
}) {
  return (
    <label
      data-field={fieldId}
      className="flex items-start justify-between gap-3 px-3 py-2 rounded-md border border-border cursor-pointer hover:bg-secondary/30 scroll-mt-24"
    >
      <span className="min-w-0">
        <span className="text-sm">{label}</span>
        {description && (
          <span className="block text-[11px] text-muted-foreground mt-0.5 leading-snug">{description}</span>
        )}
      </span>
      <Switch checked={value} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
    </label>
  );
}

export function StarsPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-0.5 h-9 px-2 border border-border rounded-md bg-background">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="p-0.5 hover:scale-110 transition-transform"
          title={`${n} stele`}
        >
          <Star className={`h-4 w-4 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
        </button>
      ))}
    </div>
  );
}
