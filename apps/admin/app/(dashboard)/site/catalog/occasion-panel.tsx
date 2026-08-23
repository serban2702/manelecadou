'use client';

import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { IconPicker } from '@/components/icon-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { SiteDto, SiteOccasionEntry } from '@/lib/api/sites.api';
import { Field } from '../studio-primitives';
import { DualPrompt } from './dual-prompt';
import { applyDefaultLocaleField, setI18nValue } from './helpers';
import { I18nFields } from './i18n-fields';
import type { MusicEngine } from './types';

export function OccasionPanel({
  entry,
  idx,
  total,
  engine,
  site,
  onChange,
  onMove,
  onRemove,
}: {
  entry: SiteOccasionEntry;
  idx: number;
  total: number;
  engine: MusicEngine;
  site: SiteDto;
  onChange: (patch: Partial<SiteOccasionEntry>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const siteLocale = site.locale || 'ro';

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{entry.nm || 'Ocazie nouă'}</div>
            <code className="text-[10px] text-muted-foreground">{entry.id}</code>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button size="sm" variant="ghost" onClick={() => onMove(-1)} disabled={idx === 0} title="Sus">
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onMove(1)} disabled={idx === total - 1} title="Jos">
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={onRemove} title="Șterge">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>

        <DualPrompt
          engine={engine}
          suno={entry.sunoPrompt ?? ''}
          google={entry.googlePrompt ?? ''}
          onSuno={(v) => onChange({ sunoPrompt: v })}
          onGoogle={(v) => onChange({ googlePrompt: v })}
          sunoHelp="Tag-uri extra pe ocazie. Ex: birthday celebration, la mulți ani."
          googleHelp="Limbaj natural. Ex: Sărbătoare de ziua persoanei menționate, energie festivă."
          sunoPlaceholder="birthday celebration, la mulți ani, festive family gathering"
          googlePlaceholder="Sărbătoare de ziua persoanei menționate. Energie festivă de la mulți ani."
          sunoRows={3}
          googleRows={3}
          sunoFieldId="catalog.occasion.sunoPrompt"
          googleFieldId="catalog.occasion.googlePrompt"
        />

        <I18nFields
          siteLocale={siteLocale}
          i18n={entry.i18n}
          fields={[{ key: 'nm', label: 'Nume', placeholder: 'Zi naștere' }]}
          defaults={{ nm: entry.nm ?? '' }}
          onDefaultChange={(key, value) => {
            if (key !== 'nm') return;
            onChange({ nm: value, i18n: applyDefaultLocaleField(entry.i18n, siteLocale, 'nm') });
          }}
          onLocaleChange={(locale, key, value) => {
            onChange({ i18n: setI18nValue(entry.i18n, locale, key as 'nm', value) });
          }}
        />

        <details className="rounded-md border border-border bg-background/40">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium">
            Cod intern, icoană
          </summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-border px-3 pb-3 pt-2">
            <Field label="Cod intern" description="Minuscule, fără spații." fieldId="catalog.occasion.id">
              <Input
                value={entry.id}
                onChange={(e) => onChange({ id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
              />
            </Field>
            <Field label="Emoji de rezervă">
              <Input value={entry.em ?? ''} onChange={(e) => onChange({ em: e.target.value })} maxLength={4} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Icoană">
                <IconPicker value={entry.ic ?? null} onChange={(ic) => onChange({ ic: ic ?? undefined })} />
              </Field>
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
