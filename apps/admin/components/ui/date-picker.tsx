'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './button';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

interface DatePickerProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  clearable?: boolean;
  fromYear?: number;
  toYear?: number;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Alege data',
  className,
  disabled,
  clearable = true,
  fromYear,
  toYear,
}: DatePickerProps) {
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
          <CalendarIcon className="h-4 w-4 opacity-70" />
          {value ? format(value, 'PPP', { locale: ro }) : <span>{placeholder}</span>}
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
          onSelect={onChange}
          captionLayout={fromYear || toYear ? 'dropdown' : undefined}
          startMonth={fromYear ? new Date(fromYear, 0) : undefined}
          endMonth={toYear ? new Date(toYear, 11) : undefined}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
