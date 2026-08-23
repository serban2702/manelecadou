'use client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { I18N_FIELD_LOCALES, LOCALE_LABELS } from '../studio-constants';
import { Field } from '../studio-primitives';

export type I18nFieldDef = {
  key: string;
  label: string;
  rows?: number;
  placeholder?: string;
};

function localeLabel(loc: string): string {
  return LOCALE_LABELS[loc as keyof typeof LOCALE_LABELS] ?? loc;
}

function bagFilled(
  bag: Record<string, string | undefined> | undefined,
  fields: I18nFieldDef[],
): boolean {
  if (!bag) return false;
  return fields.some((f) => !!bag[f.key]?.trim());
}

export function I18nFields({
  siteLocale,
  i18n,
  fields,
  defaults,
  onDefaultChange,
  onLocaleChange,
}: {
  siteLocale: string;
  i18n?: Record<string, Record<string, string | undefined>>;
  fields: I18nFieldDef[];
  defaults: Record<string, string>;
  onDefaultChange: (key: string, value: string) => void;
  onLocaleChange: (locale: string, key: string, value: string) => void;
}) {
  const other = I18N_FIELD_LOCALES.filter((l) => l !== siteLocale);
  const translated = other.filter((loc) => bagFilled(i18n?.[loc], fields)).length;
  const siteLocaleName = localeLabel(siteLocale);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2">
        {fields.map((f, i) => (
          <Field
            key={f.key}
            label={`${f.label} (${siteLocaleName})`}
            description={i === 0 ? 'Limba site-ului. Celelalte limbi stau în traduceri.' : undefined}
            fieldId={`catalog.i18n.${f.key}`}
          >
            {f.rows && f.rows > 1 ? (
              <Textarea
                value={defaults[f.key] ?? ''}
                onChange={(e) => onDefaultChange(f.key, e.target.value)}
                rows={f.rows}
                placeholder={f.placeholder}
              />
            ) : (
              <Input
                value={defaults[f.key] ?? ''}
                onChange={(e) => onDefaultChange(f.key, e.target.value)}
                placeholder={f.placeholder}
              />
            )}
          </Field>
        ))}
      </div>

      <details className="rounded-md border border-border bg-background/40">
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium">
          Traduceri — {translated} din {other.length} limbi
        </summary>
        <div className="space-y-2 border-t border-border px-3 pb-3 pt-2">
          {other.map((loc) => {
            const entry = i18n?.[loc];
            const filled = bagFilled(entry, fields);
            return (
              <details key={loc} className="rounded-md border border-border/70">
                <summary className="flex cursor-pointer select-none items-center gap-2 px-2.5 py-1.5 text-xs">
                  <span>
                    {localeLabel(loc)} ({loc})
                  </span>
                  {filled && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </summary>
                <div className="grid grid-cols-1 gap-2 border-t border-border px-2.5 py-2">
                  {fields.map((f) => (
                    <Field key={f.key} label={f.label}>
                      {f.rows && f.rows > 1 ? (
                        <Textarea
                          value={entry?.[f.key] ?? ''}
                          onChange={(e) => onLocaleChange(loc, f.key, e.target.value)}
                          rows={f.rows}
                          placeholder={defaults[f.key] || f.placeholder}
                        />
                      ) : (
                        <Input
                          value={entry?.[f.key] ?? ''}
                          onChange={(e) => onLocaleChange(loc, f.key, e.target.value)}
                          placeholder={defaults[f.key] || f.placeholder}
                        />
                      )}
                    </Field>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </details>
    </div>
  );
}
