'use client';

import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import type { SiteTestimonialEntry } from '@/lib/api/sites.api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { I18N_FIELD_LOCALES, LOCALE_LABELS } from './studio-constants';
import { Field, StarsPicker, StudioSection } from './studio-primitives';

type TestimonialI18n = NonNullable<SiteTestimonialEntry['i18n']>[string];

function localeHasCopy(entry: TestimonialI18n | undefined): boolean {
  if (!entry) return false;
  return Boolean(entry.quote?.trim() || entry.name?.trim() || entry.role?.trim());
}

export function TestimonialsSection({
  list,
  onChange,
  locale,
  help = 'Lista de pe homepage. Gol = fallback-ul din cod. Câmpurile principale sunt limba site-ului; restul limbilor stau în traduceri.',
  fieldId = 'appearance.testimonials',
  embedded = false,
}: {
  list: SiteTestimonialEntry[];
  onChange: (next: SiteTestimonialEntry[]) => void;
  locale: string;
  help?: string;
  fieldId?: string;
  embedded?: boolean;
}) {
  const siteLocale = locale || 'ro';
  const siteLocaleLabel = LOCALE_LABELS[siteLocale as keyof typeof LOCALE_LABELS] ?? siteLocale;
  const otherLocales = I18N_FIELD_LOCALES.filter((l) => l !== siteLocale);

  function commit(next: SiteTestimonialEntry[]) {
    onChange(next);
  }

  function update(idx: number, patch: Partial<SiteTestimonialEntry>) {
    commit(list.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }

  function updateDefault(idx: number, patch: Partial<Pick<SiteTestimonialEntry, 'quote' | 'name' | 'role'>>) {
    const t = list[idx];
    const loc: TestimonialI18n = { ...(t.i18n?.[siteLocale] ?? {}) };
    for (const k of Object.keys(patch) as Array<keyof typeof patch>) delete loc[k];
    const i18n = { ...(t.i18n ?? {}) };
    if (Object.keys(loc).length === 0) delete i18n[siteLocale];
    else i18n[siteLocale] = loc;
    update(idx, { ...patch, i18n: Object.keys(i18n).length ? i18n : undefined });
  }

  function updateI18n(idx: number, locale: string, field: keyof TestimonialI18n, value: string) {
    const t = list[idx];
    const loc: TestimonialI18n = { ...(t.i18n?.[locale] ?? {}) };
    const trimmed = value.trim();
    if (trimmed === '') delete loc[field];
    else loc[field] = value;
    const i18n = { ...(t.i18n ?? {}) };
    if (Object.keys(loc).length === 0) delete i18n[locale];
    else i18n[locale] = loc;
    update(idx, { i18n: Object.keys(i18n).length ? i18n : undefined });
  }

  function add() {
    const next: SiteTestimonialEntry = {
      id: `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      stars: 5,
      quote: '',
      name: '',
      role: '',
      avatar: '',
    };
    commit([...list, next]);
  }

  function remove(idx: number) {
    commit(list.filter((_, i) => i !== idx));
  }

  function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[idx], next[target]] = [next[target], next[idx]];
    commit(next);
  }

  const body = (
    <>
      <div className="flex items-center justify-between gap-2" data-field={fieldId}>
        <span className="text-xs text-muted-foreground">
          {list.length === 0 ? 'Nicio recenzie' : `${list.length} ${list.length === 1 ? 'recenzie' : 'recenzii'}`}
        </span>
        <Button size="sm" variant="outline" onClick={add}>
          <Plus className="h-4 w-4" />
          Adaugă
        </Button>
      </div>

      {list.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Niciun testimonial. Apasă „Adaugă” pentru primul.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {list.map((t, idx) => {
            const translated = otherLocales.filter((loc) => localeHasCopy(t.i18n?.[loc])).length;
            const quote = t.i18n?.[siteLocale]?.quote ?? t.quote;
            const name = t.i18n?.[siteLocale]?.name ?? t.name;
            const role = t.i18n?.[siteLocale]?.role ?? t.role;
            return (
              <Card key={t.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-2">
                        <Field label="Stele">
                          <StarsPicker value={t.stars} onChange={(v) => update(idx, { stars: v })} />
                        </Field>
                      </div>
                      <div className="sm:col-span-2">
                        <Field label="Avatar" description="1–3 litere.">
                          <Input
                            value={t.avatar}
                            maxLength={3}
                            onChange={(e) => update(idx, { avatar: e.target.value.toUpperCase().slice(0, 3) })}
                            placeholder="CB"
                            className="uppercase"
                          />
                        </Field>
                      </div>
                      <div className="sm:col-span-4">
                        <Field label="Nume">
                          <Input
                            value={name}
                            onChange={(e) => updateDefault(idx, { name: e.target.value })}
                            placeholder="Costel B."
                          />
                        </Field>
                      </div>
                      <div className="sm:col-span-4">
                        <Field label="Rol / locație">
                          <Input
                            value={role}
                            onChange={(e) => updateDefault(idx, { role: e.target.value })}
                            placeholder="Buzău"
                          />
                        </Field>
                      </div>
                      <div className="sm:col-span-12">
                        <Field label="Citat" description={`Limba site-ului (${siteLocaleLabel}).`}>
                          <Textarea
                            value={quote}
                            onChange={(e) => updateDefault(idx, { quote: e.target.value })}
                            rows={2}
                            placeholder='"Frate, șeful a plâns. Mărire de salariu garantată."'
                          />
                        </Field>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => move(idx, -1)} disabled={idx === 0} title="Sus">
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => move(idx, 1)} disabled={idx === list.length - 1} title="Jos">
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(idx)} title="Șterge">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <details className="rounded-md border border-border bg-background/40">
                    <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium">
                      Traduceri — {translated} din {otherLocales.length} limbi
                    </summary>
                    <div className="space-y-2 border-t border-border px-3 pb-3 pt-2">
                      {otherLocales.map((loc) => {
                        const entry = t.i18n?.[loc];
                        const filled = localeHasCopy(entry);
                        return (
                          <details key={loc} className="rounded-md border border-border/70">
                            <summary className="flex cursor-pointer select-none items-center gap-2 px-2.5 py-1.5 text-xs">
                              <span>
                                {LOCALE_LABELS[loc]} ({loc})
                              </span>
                              {filled && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                            </summary>
                            <div className="grid grid-cols-1 gap-2 border-t border-border px-2.5 py-2 sm:grid-cols-2">
                              <Field label="Nume">
                                <Input
                                  value={entry?.name ?? ''}
                                  onChange={(e) => updateI18n(idx, loc, 'name', e.target.value)}
                                  placeholder={name || 'Costel B.'}
                                />
                              </Field>
                              <Field label="Rol / locație">
                                <Input
                                  value={entry?.role ?? ''}
                                  onChange={(e) => updateI18n(idx, loc, 'role', e.target.value)}
                                  placeholder={role || 'Buzău'}
                                />
                              </Field>
                              <div className="sm:col-span-2">
                                <Field label="Citat">
                                  <Textarea
                                    value={entry?.quote ?? ''}
                                    onChange={(e) => updateI18n(idx, loc, 'quote', e.target.value)}
                                    rows={2}
                                    placeholder={quote || 'Traducerea citatului'}
                                  />
                                </Field>
                              </div>
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </details>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );

  if (embedded) return <div className="space-y-3">{body}</div>;
  return (
    <StudioSection title="Testimoniale" help={help}>
      {body}
    </StudioSection>
  );
}
