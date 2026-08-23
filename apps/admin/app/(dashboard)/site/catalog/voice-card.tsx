'use client';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import type { SampleStatusDto, SiteVoiceEntry } from '@/lib/api/sites.api';
import { EntryGlyph } from './helpers';
import { SampleMiniPlayer } from './sample-toolbar';

export function VoiceCard({
  entry,
  selected,
  sample,
  busy,
  onSelect,
}: {
  entry: SiteVoiceEntry;
  selected: boolean;
  sample: SampleStatusDto | null;
  busy: boolean;
  onSelect: () => void;
}) {
  const genderLabel = entry.gender === 'f' ? 'Feminin' : entry.gender === 'm' ? 'Masculin' : null;
  const hasPersona = !!entry.sunoPersonaId?.trim();
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
      className={cn('cursor-pointer transition-colors', selected && 'ring-1 ring-primary/50 bg-primary/5')}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start gap-2.5">
          <EntryGlyph ic={entry.ic} emoji={entry.av} size={32} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{entry.nm || <span className="italic text-muted-foreground">fără nume</span>}</div>
            <code className="text-[10px] text-muted-foreground">{entry.id}</code>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {genderLabel && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{genderLabel}</span>
          )}
          <span
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded font-medium',
              hasPersona ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400',
            )}
          >
            {hasPersona ? 'Persona' : 'Persona lipsă'}
          </span>
        </div>
        <SampleMiniPlayer sample={sample} busy={busy} />
      </CardContent>
    </Card>
  );
}
