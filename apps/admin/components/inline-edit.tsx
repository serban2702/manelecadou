'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Input } from '@/components/ui/input';

export type SaveStatus = 'saving' | 'saved' | 'error';

/** Indicator mic „se salvează / salvat / eroare" pentru autosave inline. */
export function SaveIndicator({ status }: { status?: SaveStatus }) {
  if (status === 'saving')
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> salvez…
      </span>
    );
  if (status === 'saved')
    return (
      <span className="inline-flex items-center gap-1 text-emerald-500">
        <Check className="h-3 w-3" /> salvat
      </span>
    );
  if (status === 'error') return <span className="text-destructive">eroare</span>;
  return null;
}

/**
 * Celulă de tabel editabilă cu commit pe blur / Enter (Esc anulează). Re-sincronizează
 * doar când valoarea committed se schimbă din exterior (dep = `value`, nu `draft`),
 * deci nu suprascrie ce tastezi. `onCommit` e chemat doar dacă valoarea chiar s-a schimbat.
 */
export function EditableCell({
  value,
  onCommit,
  placeholder,
  disabled,
  mono,
  className,
}: {
  value: string | null;
  onCommit: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  mono?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  return (
    <Input
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if ((draft ?? '') !== (value ?? '')) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setDraft(value ?? '');
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
      className={cn(
        'h-8 border-transparent bg-transparent px-2 text-xs hover:border-border focus:border-border focus:bg-background',
        mono && 'font-mono',
        className,
      )}
    />
  );
}
