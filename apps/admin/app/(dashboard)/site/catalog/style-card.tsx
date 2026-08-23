'use client';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import type { SampleStatusDto, SiteStyleEntry } from '@/lib/api/sites.api';
import { PromptPills } from './dual-prompt';
import { EntryGlyph } from './helpers';
import { SampleMiniPlayer } from './sample-toolbar';
import type { MusicEngine } from './types';
import { publicSiteAsset } from '../interfaces/cadou-defaults';

export function StyleCard({
  entry,
  selected,
  engine,
  sample,
  busy,
  onSelect,
}: {
  entry: SiteStyleEntry;
  selected: boolean;
  engine: MusicEngine;
  sample: SampleStatusDto | null;
  busy: boolean;
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
        {entry.artUrl ? (
          <div
            className="h-24 w-full rounded-md bg-cover bg-center border border-border"
            style={{ backgroundImage: `url(${publicSiteAsset(entry.artUrl)})` }}
          />
        ) : null}
        <div className="flex items-start gap-2.5">
          <EntryGlyph ic={entry.ic} emoji={entry.em} size={32} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-medium truncate">{entry.nm || <span className="italic text-muted-foreground">fără nume</span>}</span>
              {entry.heat ? (
                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">{entry.heat}</span>
              ) : null}
            </div>
            <code className="text-[10px] text-muted-foreground">{entry.id}</code>
          </div>
        </div>
        <PromptPills suno={entry.sunoPrompt} google={entry.googlePrompt} engine={engine} />
        <SampleMiniPlayer sample={sample} busy={busy} />
      </CardContent>
    </Card>
  );
}
