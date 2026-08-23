'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Loader2, Sparkles } from 'lucide-react';
import { IconPicker } from '@/components/icon-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import {
  SitesApi,
  type SampleStatusDto,
  type SiteDto,
  type SiteSampleDefaults,
  type SiteVoiceEntry,
} from '@/lib/api/sites.api';
import { GLOBAL_VOICE_IDS } from '../studio-constants';
import { Field } from '../studio-primitives';
import { applyDefaultLocaleField, setI18nValue } from './helpers';
import { I18nFields } from './i18n-fields';
import { SampleToolbar } from './sample-toolbar';
import type { GenerateOverrides } from './types';

export function VoicePanel({
  entry,
  idx,
  total,
  sample,
  busy,
  site,
  siteId,
  onChange,
  onMove,
  onGenerate,
  onUpload,
  onUpdateStartSec,
  hideSiteSamples = false,
  extra,
}: {
  entry: SiteVoiceEntry;
  idx: number;
  total: number;
  sample: SampleStatusDto | null;
  busy: boolean;
  site: SiteDto;
  siteId: string;
  onChange: (patch: Partial<SiteVoiceEntry>) => void;
  onMove: (dir: -1 | 1) => void;
  onGenerate?: (regenerate: boolean, overrides?: GenerateOverrides) => void;
  onUpload?: (file: File) => void;
  onUpdateStartSec?: (sec: number) => void;
  hideSiteSamples?: boolean;
  extra?: ReactNode;
}) {
  const siteLocale = site.locale || 'ro';
  const idLocked = GLOBAL_VOICE_IDS.includes(entry.id);
  const hasSample = !!sample?.entry;
  const [personaBusy, setPersonaBusy] = useState(false);
  const { toast } = useToast();

  async function generatePersona() {
    setPersonaBusy(true);
    try {
      const res = await SitesApi.generatePersona(siteId, entry.id, {
        name: entry.sunoPersonaName || entry.nm,
      });
      const v = res.voice as SiteVoiceEntry;
      onChange({
        sunoPersonaId: v.sunoPersonaId,
        sunoPersonaName: v.sunoPersonaName,
        sunoPersonaSourceTaskId: v.sunoPersonaSourceTaskId,
        sunoPersonaSourceAudioId: v.sunoPersonaSourceAudioId,
        sunoPersonaCreatedAt: v.sunoPersonaCreatedAt,
      });
      toast({ variant: 'success', title: 'Persona generată', description: v.sunoPersonaId });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare persona', description: (err as Error).message });
    } finally {
      setPersonaBusy(false);
    }
  }

  function updDefaults(patch: Partial<SiteSampleDefaults>) {
    onChange({ sampleDefaults: { ...(entry.sampleDefaults ?? {}), ...patch } });
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{entry.nm || 'Voce'}</div>
            <code className="text-[10px] text-muted-foreground">{entry.id}</code>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button size="sm" variant="ghost" onClick={() => onMove(-1)} disabled={idx === 0} title="Sus">
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onMove(1)} disabled={idx === total - 1} title="Jos">
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field
            label="Cod intern"
            description={idLocked ? 'Bărbat / femeie sunt vocile globale. Nu se schimbă.' : 'Nu schimba după ce ai mostre.'}
            fieldId="catalog.voice.id"
          >
            <Input
              value={entry.id}
              disabled={idLocked}
              onChange={(e) => onChange({ id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
            />
          </Field>
          <Field label="Avatar / emoji">
            <Input value={entry.av ?? ''} onChange={(e) => onChange({ av: e.target.value })} maxLength={4} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Icoană">
              <IconPicker value={entry.ic ?? null} onChange={(ic) => onChange({ ic: ic ?? undefined })} />
            </Field>
          </div>
        </div>

        <I18nFields
          siteLocale={siteLocale}
          i18n={entry.i18n}
          fields={[
            { key: 'nm', label: 'Nume', placeholder: 'Bărbătească' },
            { key: 'tg', label: 'Tagline', placeholder: 'Voce de bărbat' },
          ]}
          defaults={{ nm: entry.nm ?? '', tg: entry.tg ?? '' }}
          onDefaultChange={(key, value) => {
            const i18n = applyDefaultLocaleField(entry.i18n, siteLocale, key as 'nm' | 'tg');
            if (key === 'nm') onChange({ nm: value, i18n });
            else if (key === 'tg') onChange({ tg: value, i18n });
          }}
          onLocaleChange={(locale, key, value) => {
            onChange({ i18n: setI18nValue(entry.i18n, locale, key as 'nm' | 'tg', value) });
          }}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field
            label="ID voce Suno"
            description="Override pe voiceMap. Gol = se folosește id-ul (male/female)."
            fieldId="catalog.voice.sunoVoice"
          >
            <Input
              value={entry.sunoVoice ?? ''}
              onChange={(e) => onChange({ sunoVoice: e.target.value.trim() || undefined })}
              placeholder="ex. male"
            />
          </Field>
          <Field label="Registru" fieldId="catalog.voice.gender">
            <select
              value={entry.gender ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                onChange({ gender: v === 'm' || v === 'f' ? v : undefined });
              }}
              className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm"
            >
              <option value="">— nesetat —</option>
              <option value="m">Masculin</option>
              <option value="f">Feminin</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field
            label="ID persona Suno"
            description="Se aplică pe toate generările cu această voce, dacă stilul n-are persona pe gen."
            fieldId="catalog.voice.persona"
          >
            <Input
              value={entry.sunoPersonaId ?? ''}
              onChange={(e) => onChange({ sunoPersonaId: e.target.value.trim() || undefined })}
              placeholder="personaId"
            />
          </Field>
          <Field label="Nume persona">
            <Input
              value={entry.sunoPersonaName ?? ''}
              onChange={(e) => onChange({ sunoPersonaName: e.target.value || undefined })}
              placeholder="ex. Bărbat clasic"
            />
          </Field>
          {!hideSiteSamples && (
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void generatePersona()}
                disabled={personaBusy || !hasSample}
                title={!hasSample ? 'Generează întâi o mostră cu taskId Suno' : 'Generează persona din mostră'}
              >
                {personaBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Generează persona din mostră
              </Button>
              {entry.sunoPersonaCreatedAt && (
                <span className="text-[11px] text-muted-foreground">
                  din {new Date(entry.sunoPersonaCreatedAt).toLocaleString('ro-RO')}
                  {entry.sunoPersonaSourceTaskId ? ` · task ${entry.sunoPersonaSourceTaskId.slice(0, 8)}…` : ''}
                </span>
              )}
            </div>
          )}
        </div>

        {!hideSiteSamples && onGenerate && onUpload && onUpdateStartSec && (
          <SampleToolbar
            kind="voice"
            entryId={entry.id}
            sample={sample}
            busy={busy}
            site={site}
            siteId={siteId}
            sampleDefaults={entry.sampleDefaults ?? {}}
            voiceKeys={GLOBAL_VOICE_IDS}
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
