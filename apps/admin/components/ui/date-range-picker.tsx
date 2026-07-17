'use client';

import * as React from 'react';
import { format, subDays, startOfDay, endOfDay, startOfMonth } from 'date-fns';
import { ro } from 'date-fns/locale';
import { CalendarArrowUp, CalendarRange } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { Button } from './button';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Separator } from './separator';
import { cn } from '@/lib/cn';

export interface DateRangeValue {
  from: Date;
  to: Date;
}

interface Preset {
  key: string;
  label: string;
  range: () => DateRangeValue;
}

/** Începutul datelor reale (tracking + ads live) — 25 mai 2026. Backend-ul oricum
 *  limitează analitica la această zi, deci „Tot timpul" = de atunci încoace. */
export const DATA_EPOCH = new Date(2026, 4, 25);

const PRESETS: Preset[] = [
  {
    key: 'all',
    label: 'Tot timpul',
    range: () => ({ from: startOfDay(DATA_EPOCH), to: endOfDay(new Date()) }),
  },
  { key: 'today', label: 'Azi', range: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
  {
    key: 'yesterday',
    label: 'Ieri',
    range: () => ({ from: startOfDay(subDays(new Date(), 1)), to: endOfDay(subDays(new Date(), 1)) }),
  },
  {
    key: '7d',
    label: 'Ultimele 7 zile',
    range: () => ({ from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) }),
  },
  {
    key: '14d',
    label: 'Ultimele 14 zile',
    range: () => ({ from: startOfDay(subDays(new Date(), 13)), to: endOfDay(new Date()) }),
  },
  {
    key: '30d',
    label: 'Ultimele 30 zile',
    range: () => ({ from: startOfDay(subDays(new Date(), 29)), to: endOfDay(new Date()) }),
  },
  {
    key: 'mtd',
    label: 'Luna curentă',
    range: () => ({ from: startOfMonth(new Date()), to: endOfDay(new Date()) }),
  },
  {
    key: '90d',
    label: 'Ultimele 90 zile',
    range: () => ({ from: startOfDay(subDays(new Date(), 89)), to: endOfDay(new Date()) }),
  },
];

interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (range: DateRangeValue) => void;
  className?: string;
  /** Afișează un buton mic în dreapta care mută data de final la ziua curentă,
   *  păstrând data de început neschimbată. */
  showTodayShortcut?: boolean;
}

export function DateRangePicker({ value, onChange, className, showTodayShortcut }: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<DateRange | undefined>({ from: value.from, to: value.to });
  // Pe telefon afișăm o singură lună și punem preset-urile deasupra calendarului.
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  React.useEffect(() => {
    setDraft({ from: value.from, to: value.to });
  }, [value.from, value.to]);

  function applyPreset(p: Preset) {
    const r = p.range();
    setDraft({ from: r.from, to: r.to });
    onChange(r);
    setOpen(false);
  }

  function applyDraft() {
    if (draft?.from && draft?.to) {
      onChange({ from: startOfDay(draft.from), to: endOfDay(draft.to) });
      setOpen(false);
    }
  }

  const picker = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('justify-start text-left font-normal h-9', className)}>
          <CalendarRange className="h-4 w-4 opacity-70" />
          <span>
            {format(value.from, 'd MMM', { locale: ro })} – {format(value.to, 'd MMM yyyy', { locale: ro })}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-[calc(100vw-1.5rem)] p-0" align="end">
        <div className="flex flex-col sm:flex-row">
          <div className="border-b sm:border-b-0 sm:border-r border-border p-2 flex gap-1 overflow-x-auto sm:flex-col sm:min-w-[160px] sm:overflow-visible">
            <div className="hidden sm:block text-[10px] uppercase tracking-wider text-muted-foreground px-2 pt-1 pb-1">
              Presets
            </div>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => applyPreset(p)}
                className="text-left text-sm whitespace-nowrap px-2 py-1.5 rounded-md hover:bg-secondary transition shrink-0"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div>
            <Calendar
              mode="range"
              numberOfMonths={isMobile ? 1 : 2}
              selected={draft}
              onSelect={setDraft}
              defaultMonth={value.from}
              autoFocus
            />
            <Separator />
            <div className="flex items-center justify-between p-2">
              <div className="text-xs text-muted-foreground">
                {draft?.from && draft?.to
                  ? `${format(draft.from, 'd MMM', { locale: ro })} – ${format(draft.to, 'd MMM yyyy', { locale: ro })}`
                  : 'Selectează un interval'}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Anulează
                </Button>
                <Button size="sm" onClick={applyDraft} disabled={!draft?.from || !draft?.to}>
                  Aplică
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );

  if (!showTodayShortcut) return picker;

  return (
    <div className="flex items-center gap-1.5">
      {picker}
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0"
        title="Adu data de final la ziua de azi (data de început rămâne)"
        aria-label="Adu data de final la ziua de azi"
        onClick={() => onChange({ from: value.from, to: endOfDay(new Date()) })}
      >
        <CalendarArrowUp className="opacity-70" />
      </Button>
    </div>
  );
}
