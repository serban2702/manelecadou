'use client';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import type { SiteOccasionEntry } from '@/lib/api/sites.api';
import { PromptPills } from './dual-prompt';
import { EntryGlyph } from './helpers';
import type { MusicEngine } from './types';

export function OccasionCard({
  entry,
  selected,
  engine,
  onSelect,
}: {
  entry: SiteOccasionEntry;
  selected: boolean;
  engine: MusicEngine;
  onSelect: () => void;
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'cursor-pointer transition-colors',
        selected && 'ring-1 ring-primary/50 bg-primary/5',
        !selected && !entry.sunoPrompt?.trim() && engine === 'suno' && 'border-amber-500/30',
        !selected && !entry.googlePrompt?.trim() && engine === 'google' && 'border-amber-500/30',
      )}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start gap-2.5">
          <EntryGlyph ic={entry.ic} emoji={entry.em} size={32} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{entry.nm || <span className="italic text-muted-foreground">fără nume</span>}</div>
            <code className="text-[10px] text-muted-foreground">{entry.id}</code>
          </div>
        </div>
        <PromptPills suno={entry.sunoPrompt} google={entry.googlePrompt} engine={engine} />
      </CardContent>
    </Card>
  );
}
