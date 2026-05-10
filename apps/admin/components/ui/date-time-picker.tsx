'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { CalendarClock, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './button';
import { Calendar } from './calendar';
import { Input } from './input';
import { Label } from './label';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

interface DateTimePickerProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  clearable?: boolean;
  fromYear?: number;
  toYear?: number;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = 'Alege data și ora',
  className,
  disabled,
  clearable = true,
  fromYear,
  toYear,
}: DateTimePickerProps) {
  const timeValue = value ? format(value, 'HH:mm') : '23:59';

  function handleDateSelect(d: Date | undefined) {
    if (!d) {
      onChange(undefined);
      return;
    }
    const next = new Date(d);
    if (value) {
      next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    } else {
      const [h, m] = timeValue.split(':').map((x) => parseInt(x, 10));
      next.setHours(h, m, 0, 0);
    }
    onChange(next);
  }

  function handleTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const [h, m] = e.target.value.split(':').map((x) => parseInt(x, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    const base = value ?? new Date();
    const next = new Date(base);
    next.setHours(h, m, 0, 0);
    onChange(next);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal h-9 px-3',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarClock className="h-4 w-4 opacity-70" />
          {value ? format(value, "d MMM yyyy 'la' HH:mm", { locale: ro }) : <span>{placeholder}</span>}
          {clearable && value && (
            <span
              role="button"
              tabIndex={-1}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(undefined);
              }}
              className="ml-auto rounded-sm p-0.5 opacity-60 hover:opacity-100 hover:bg-secondary"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={handleDateSelect}
          captionLayout={fromYear || toYear ? 'dropdown' : undefined}
          startMonth={fromYear ? new Date(fromYear, 0) : undefined}
          endMonth={toYear ? new Date(toYear, 11) : undefined}
          autoFocus
        />
        <div className="border-t border-border p-3 flex items-end gap-3">
          <div className="flex-1">
            <Label className="mb-1 block">Ora</Label>
            <Input type="time" value={timeValue} onChange={handleTimeChange} step={60} />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              const now = new Date();
              const next = value ? new Date(value) : new Date();
              next.setHours(now.getHours(), now.getMinutes(), 0, 0);
              onChange(next);
            }}
          >
            Acum
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
