'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from './tabs';
import { cn } from '@/lib/cn';

export interface ResponsiveTab {
  value: string;
  /** Etichetă afișată în tab-ul de desktop (poate fi JSX cu badge-uri). */
  label: React.ReactNode;
  /** Etichetă text pentru `<option>`-ul de pe mobil. Dacă lipsește, folosește `label` dacă e string, altfel `value`. */
  selectLabel?: string;
}

/**
 * Taburi responsive: pe desktop bara clasică de tab-uri, pe mobil un `<select>`
 * nativ (mult mai prietenos cu degetul decât un rând de tab-uri care se înfășoară
 * pe mai multe rânduri). Componenta e CONTROLATĂ — pasează `value` + `onValueChange`.
 *
 * `children` = blocurile `<TabsContent>` (rămân neschimbate).
 */
export function ResponsiveTabs({
  tabs,
  value,
  onValueChange,
  children,
  className,
  listClassName,
}: {
  tabs: ResponsiveTab[];
  value: string;
  onValueChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
  listClassName?: string;
}) {
  const optionLabel = (t: ResponsiveTab): string =>
    t.selectLabel ?? (typeof t.label === 'string' ? t.label : t.value);

  return (
    <Tabs value={value} onValueChange={onValueChange} className={cn('space-y-4', className)}>
      {/* Mobil: select nativ */}
      <div className="relative md:hidden">
        <select
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className="w-full appearance-none rounded-lg border border-border bg-card px-3 py-2.5 pr-9 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-label="Selectează secțiunea"
        >
          {tabs.map((t) => (
            <option key={t.value} value={t.value}>
              {optionLabel(t)}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>

      {/* Desktop: bara de tab-uri */}
      <TabsList className={cn('hidden md:inline-flex flex-wrap justify-start gap-1 h-auto', listClassName)}>
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {children}
    </Tabs>
  );
}
