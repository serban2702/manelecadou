'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { ro } from 'date-fns/locale';
import { cn } from '@/lib/cn';
import { buttonVariants } from './button';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      locale={ro}
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'flex flex-col gap-3',
        month_caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-sm font-medium capitalize',
        nav: 'flex items-center gap-1',
        button_previous: cn(
          buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
          'absolute left-1 top-1 h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100',
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
          'absolute right-1 top-1 h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100',
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday:
          'text-muted-foreground rounded-md w-8 font-normal text-[0.7rem] uppercase tracking-wide flex items-center justify-center h-8',
        week: 'flex w-full mt-1',
        day: 'h-8 w-8 text-center text-sm p-0 relative [&:has([aria-selected])]:bg-secondary [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-secondary/50 [&:has([aria-selected])]:rounded-md focus-within:relative focus-within:z-20',
        day_button: cn(
          buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
          'h-8 w-8 p-0 font-normal aria-selected:opacity-100',
        ),
        range_end: 'day-range-end',
        selected:
          '!bg-primary !text-primary-foreground hover:!bg-primary hover:!text-primary-foreground focus:!bg-primary focus:!text-primary-foreground',
        today: 'bg-secondary text-foreground',
        outside:
          'day-outside text-muted-foreground/40 aria-selected:bg-secondary/50 aria-selected:text-muted-foreground',
        disabled: 'text-muted-foreground/40 opacity-40',
        range_middle: 'aria-selected:bg-secondary aria-selected:text-foreground',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: cls, ...rest }) => {
          if (orientation === 'left') return <ChevronLeft className={cn('h-4 w-4', cls)} {...rest} />;
          return <ChevronRight className={cn('h-4 w-4', cls)} {...rest} />;
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
