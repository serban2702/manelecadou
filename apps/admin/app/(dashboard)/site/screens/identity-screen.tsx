'use client';

import type { SiteDto } from '@/lib/api/sites.api';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CURRENCIES, CURRENCY_LABELS, LOCALES, LOCALE_LABELS } from '../studio-constants';
import { Field, StudioSection, Toggle } from '../studio-primitives';

export function IdentityScreen({
  form,
  setForm,
}: {
  form: SiteDto;
  setForm: (f: SiteDto) => void;
}) {
  return (
    <div className="grid gap-6 scroll-mt-24" data-field="identity">
      <StudioSection
        title="Identitate"
        help="Cine e site-ul ăsta: domeniu, nume, limbă, valută."
      >
        <Card>
          <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Domeniu"
              fieldId="identity.domain"
              description="Fără https://. DNS-ul trebuie să pointeze aici, nor gri pe Cloudflare."
            >
              <Input
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value.toLowerCase().trim() })}
                placeholder="manelecadou.ro"
              />
            </Field>
            <Field label="Nume" fieldId="identity.name" description="Numele de brand, pe site și în emailuri.">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Manele Cadou"
              />
            </Field>
            <Field
              label="Limbă"
              fieldId="identity.locale"
              description="Limba implicită a site-ului. Un domeniu = o limbă, de obicei."
            >
              <select
                value={form.locale}
                onChange={(e) => setForm({ ...form, locale: e.target.value })}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
              >
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {LOCALE_LABELS[l]} ({l})
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Valută"
              fieldId="identity.currency"
              description="Apare lângă prețuri pe site (29,99 lei). HUF tot cu două zecimale."
            >
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {CURRENCY_LABELS[c]}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Toggle
                label="Meniu de limbă pe site"
                fieldId="identity.langSwitcher"
                description="Afișează selectorul de limbă în topbar. Implicit oprit: un domeniu = o limbă."
                value={form.langSwitcherEnabled ?? false}
                onChange={(v) => setForm({ ...form, langSwitcherEnabled: v })}
              />
            </div>
            <div className="sm:col-span-2">
              <Field
                label="Note interne"
                fieldId="identity.notes"
                description="Doar pentru echipă. Nu apar pe site."
              >
                <Textarea
                  value={form.notes ?? ''}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  placeholder="Ex: domeniu de test, client X, nu schimba prețul fără acord."
                />
              </Field>
            </div>
          </CardContent>
        </Card>
        <details className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium select-none">Intern</summary>
          <div className="px-4 pb-4 border-t border-border pt-4">
            <Field
              label="Cod intern"
              fieldId="identity.slug"
              description="Setat la creare. Nu se schimbă — e legat de mostre și linkuri salvate."
            >
              <Input value={form.slug} disabled />
            </Field>
          </div>
        </details>
      </StudioSection>
    </div>
  );
}
