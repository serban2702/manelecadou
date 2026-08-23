'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { centsToMajor, currencySuffix, majorToCents } from '../money';

/** Input de bani: UI în unități majore (29,99), onChange în cents (2999). Gol = null. */
export function MoneyInput({
  cents,
  onChange,
  currency,
  placeholder,
  disabled,
  className,
}: {
  cents: number | null | undefined;
  onChange: (cents: number | null) => void;
  currency: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const shown = cents != null && cents > 0 ? centsToMajor(cents) : '';
  const [draft, setDraft] = useState(shown);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (focused) return;
    setDraft(shown);
  }, [shown, focused]);

  return (
    <div className={cn('relative', className)}>
      <Input
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        className="pr-12 tabular-nums"
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          if (v.trim() === '') {
            onChange(null);
            return;
          }
          const parsed = majorToCents(v);
          if (parsed != null) onChange(parsed);
        }}
        onBlur={() => {
          setFocused(false);
          const parsed = majorToCents(draft);
          if (parsed == null) {
            setDraft(shown);
            if (draft.trim() === '') onChange(null);
            return;
          }
          onChange(parsed);
          setDraft(centsToMajor(parsed));
        }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        {currencySuffix(currency)}
      </span>
    </div>
  );
}
