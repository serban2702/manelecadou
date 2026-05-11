'use client';

import { useState } from 'react';
import { Languages, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

/**
 * Mic toggle „Original ↔ RO" pentru orice mesaj cu traducere disponibilă.
 * Afișează badge cu limba detectată și scor de consens; click → schimbă vizualizarea.
 *
 * Folosit atât în Inbox (mail) cât și în Chat. Părintele decide ce render dă
 * pentru cele două variante (text simplu vs HTML).
 */
export function TranslationToggle({
  detectedLang,
  hasRoTranslation,
  consensus,
  onChange,
  initial = 'ro',
  className,
}: {
  detectedLang: string | null;
  hasRoTranslation: boolean;
  consensus?: number | null;
  onChange?: (mode: 'original' | 'ro') => void;
  initial?: 'original' | 'ro';
  className?: string;
}) {
  const [mode, setMode] = useState<'original' | 'ro'>(initial);
  if (!detectedLang || detectedLang === 'ro' || !hasRoTranslation) return null;
  const lowConsensus = typeof consensus === 'number' && consensus < 0.7;

  function set(m: 'original' | 'ro') {
    setMode(m);
    onChange?.(m);
  }

  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <Badge variant="outline" className="text-[10px] gap-1">
        <Languages className="h-3 w-3" />
        {detectedLang}
      </Badge>
      <button
        onClick={() => set('original')}
        className={cn(
          'text-[10px] px-1.5 py-0.5 rounded border',
          mode === 'original' ? 'bg-primary/15 border-primary/40 text-primary font-medium' : 'border-border text-muted-foreground hover:bg-secondary/40',
        )}
      >
        Original
      </button>
      <button
        onClick={() => set('ro')}
        className={cn(
          'text-[10px] px-1.5 py-0.5 rounded border',
          mode === 'ro' ? 'bg-primary/15 border-primary/40 text-primary font-medium' : 'border-border text-muted-foreground hover:bg-secondary/40',
        )}
      >
        RO
      </button>
      {lowConsensus && (
        <Badge variant="destructive" className="text-[9px] h-4 px-1 gap-0.5">
          <AlertTriangle className="h-2.5 w-2.5" />
          consens {(consensus! * 100).toFixed(0)}%
        </Badge>
      )}
    </div>
  );
}
