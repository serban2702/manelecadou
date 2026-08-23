'use client';

import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { IconPicker } from '@/components/icon-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  type SampleStatusDto,
  type SiteDto,
  type SiteSampleDefaults,
  type SiteStyleEntry,
} from '@/lib/api/sites.api';
import { Field } from '../studio-primitives';
import { DualPrompt } from './dual-prompt';
import { applyDefaultLocaleField, setI18nValue } from './helpers';
import { I18nFields } from './i18n-fields';
import { SampleToolbar } from './sample-toolbar';
import type { GenerateOverrides, MusicEngine } from './types';
import { publicSiteAsset } from '../interfaces/cadou-defaults';

export function StylePanel({
  entry,
  idx,
  total,
  engine,
  sample,
  busy,
  site,
  siteId,
  voiceKeys,
  onChange,
  onMove,
  onRemove,
  onGenerate,
  onUpload,
  onUpdateStartSec,
  hideSiteSamples = false,
  extra,
}: {
  entry: SiteStyleEntry;
  idx: number;
  total: number;
  engine: MusicEngine;
  sample: SampleStatusDto | null;
  busy: boolean;
  site: SiteDto;
  siteId: string;
  voiceKeys: string[];
  onChange: (patch: Partial<SiteStyleEntry>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onGenerate?: (regenerate: boolean, overrides?: GenerateOverrides) => void;
  onUpload?: (file: File) => void;
  onUpdateStartSec?: (sec: number) => void;
  hideSiteSamples?: boolean;
  extra?: ReactNode;
}) {
  const siteLocale = site.locale || 'ro';
  const hasSample = !!sample?.entry;

  function onDefaultI18n(key: string, value: string) {
    const i18n = applyDefaultLocaleField(entry.i18n, siteLocale, key as 'nm' | 'ds' | 'heat');
    if (key === 'nm') onChange({ nm: value, i18n });
    else if (key === 'ds') onChange({ ds: value, i18n });
    else if (key === 'heat') onChange({ heat: value || undefined, i18n });
  }

  function onLocaleI18n(locale: string, key: string, value: string) {
    onChange({
      i18n: setI18nValue(entry.i18n, locale, key as 'nm' | 'ds' | 'heat', value),
    });
  }

  function updDefaults(patch: Partial<SiteSampleDefaults>) {
    onChange({ sampleDefaults: { ...(entry.sampleDefaults ?? {}), ...patch } });
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{entry.nm || 'Stil nou'}</div>
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
          sunoHelp="Tag-uri pe care le trimite Suno. Ex: manele, accordion, talger."
          googleHelp="Limbaj natural pentru Lyria: gen, instrumente, tempo, dispoziție. Nu e același text ca la Suno."
          sunoFieldId="catalog.style.sunoPrompt"
          googleFieldId="catalog.style.googlePrompt"
        />

        <Field
          label="Imagine card (artă)"
          description="URL public. Pe Cadou, default e /cadou/styles/<id>.jpg."
        >
          <Input
            value={entry.artUrl ?? ''}
            onChange={(e) => onChange({ artUrl: e.target.value || undefined })}
            placeholder="/cadou/styles/iubire.jpg"
            spellCheck={false}
          />
          {entry.artUrl ? (
            <div
              className="mt-2 h-28 w-full rounded-md bg-cover bg-center border border-border"
              style={{ backgroundImage: `url(${publicSiteAsset(entry.artUrl, site.domain)})` }}
            />
          ) : null}
        </Field>

        <I18nFields
          siteLocale={siteLocale}
          i18n={entry.i18n}
          fields={[
            { key: 'nm', label: 'Nume', placeholder: 'Clasică de pahar' },
            { key: 'ds', label: 'Descriere', placeholder: 'Acordeon, lăutărească' },
            { key: 'heat', label: 'Etichetă popularitate', placeholder: '🔥 #1' },
          ]}
          defaults={{ nm: entry.nm ?? '', ds: entry.ds ?? '', heat: entry.heat ?? '' }}
          onDefaultChange={onDefaultI18n}
          onLocaleChange={onLocaleI18n}
        />

        <details className="rounded-md border border-border bg-background/40">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium">
            Cod intern, icoană
          </summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-border px-3 pb-3 pt-2">
            <Field
              label="Cod intern"
              description={hasSample ? 'Nu schimba după ce ai mostre — se leagă de fișierul audio.' : 'Minuscule, fără spații. Ex: clasic.'}
              fieldId="catalog.style.id"
            >
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

        <Field
          label="Hint versuri"
          description="Pre-completează hint-ul AI când generezi o mostră pe acest stil."
          fieldId="catalog.style.lyricsHint"
        >
          <Textarea
            value={entry.lyricsHint ?? ''}
            onChange={(e) => onChange({ lyricsHint: e.target.value })}
            rows={2}
            placeholder="Ex: manea de jale despre dor, vocabular cu lacrimi/inimă, ritm liric lent"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field
            label="Cât de strict urmează stilul (0–1)"
            description="Tradițional: 0,7–0,9. Gol = default Suno."
            fieldId="catalog.style.styleWeight"
          >
            <Input
              type="number"
              step="0.05"
              min={0}
              max={1}
              value={entry.styleWeight ?? ''}
              onChange={(e) =>
                onChange({ styleWeight: e.target.value === '' ? undefined : Number(e.target.value) })
              }
              placeholder="(default Suno)"
            />
          </Field>
          <Field
            label="Cât de ciudat (0–1)"
            description="Creativitate. Tradițional: 0,1–0,3. Gol = default Suno."
            fieldId="catalog.style.weirdness"
          >
            <Input
              type="number"
              step="0.05"
              min={0}
              max={1}
              value={entry.weirdnessConstraint ?? ''}
              onChange={(e) =>
                onChange({
                  weirdnessConstraint: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
              placeholder="(default Suno)"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="Genuri de exclus"
              description="Separate prin virgulă. Mai eficient decât să scrii „nu pop” în prompt."
              fieldId="catalog.style.negativeTags"
            >
              <Input
                value={entry.negativeTags ?? ''}
                onChange={(e) => onChange({ negativeTags: e.target.value })}
                placeholder="pop, EDM, trap-rap"
              />
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field
            label="ID persona Suno (masculin)"
            description="Folosit când clientul alege voce bărbătească. Gol = fără persona pe stil."
            fieldId="catalog.style.personaMale"
          >
            <Input
              value={entry.sunoPersonaIdMale ?? ''}
              onChange={(e) => onChange({ sunoPersonaIdMale: e.target.value.trim() || undefined })}
              placeholder="personaId masculin"
            />
          </Field>
          <Field label="Nume persona masculin">
            <Input
              value={entry.sunoPersonaNameMale ?? ''}
              onChange={(e) => onChange({ sunoPersonaNameMale: e.target.value || undefined })}
              placeholder="ex. Clasică bărbat"
            />
          </Field>
          <Field
            label="ID persona Suno (feminin)"
            description="Folosit când clientul alege voce feminină."
          >
            <Input
              value={entry.sunoPersonaIdFemale ?? ''}
              onChange={(e) => onChange({ sunoPersonaIdFemale: e.target.value.trim() || undefined })}
              placeholder="personaId feminin"
            />
          </Field>
          <Field label="Nume persona feminin">
            <Input
              value={entry.sunoPersonaNameFemale ?? ''}
              onChange={(e) => onChange({ sunoPersonaNameFemale: e.target.value || undefined })}
              placeholder="ex. Clasică femeie"
            />
          </Field>
        </div>

        {!hideSiteSamples && onGenerate && onUpload && onUpdateStartSec && (
          <SampleToolbar
            kind="style"
            entryId={entry.id}
            sample={sample}
            busy={busy}
            site={site}
            siteId={siteId}
            sampleDefaults={entry.sampleDefaults ?? {}}
            lyricsHint={entry.lyricsHint}
            sunoPrompt={entry.sunoPrompt}
            voiceKeys={voiceKeys}
            onUpdateDefaults={updDefaults}
            onGenerate={onGenerate}
            onUpload={onUpload}
            onUpdateStartSec={onUpdateStartSec}
          />
        )}
        {extra}
      </CardContent>
    </Card>
  );
}
