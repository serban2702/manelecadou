'use client';

import type { SiteDto } from '@/lib/api/sites.api';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { SpaLink } from '@/lib/spa-router';
import { MoneyInput } from '../fields/money-input';
import { Field, StudioSection } from '../studio-primitives';

export function PricesScreen({
  form,
  setForm,
}: {
  form: SiteDto;
  setForm: (f: SiteDto) => void;
}) {
  const currency = form.currency || 'RON';
  const demoOn = form.demoEnabled !== false;

  return (
    <div className="grid gap-6">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 text-sm space-y-1">
          <div className="font-medium">Pachetele nu sunt aici</div>
          <p className="text-muted-foreground leading-snug">
            Standard / Plus / Premium (preț, refaceri, colaj, surse) se configurează pe fiecare design.
          </p>
          <SpaLink href="/site/interfaces" className="inline-flex text-primary hover:underline text-sm">
            Deschide Interfețe →
          </SpaLink>
        </CardContent>
      </Card>

      <StudioSection
        title="Demo sau plată întâi"
        help="Decide dacă vizitatorul aude 30 de secunde gratuit sau trece direct la checkout."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-field="price.demo">
          <button
            type="button"
            onClick={() => setForm({ ...form, demoEnabled: true })}
            className={cn(
              'rounded-xl border px-4 py-3 text-left transition-colors',
              demoOn
                ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/40'
                : 'border-border hover:border-primary/30',
            )}
          >
            <div className="text-sm font-medium">Demo 30s gratuit, apoi plată</div>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              Clientul generează, aude 30 de secunde, apoi deblochează piesa cu plată.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setForm({ ...form, demoEnabled: false })}
            className={cn(
              'rounded-xl border px-4 py-3 text-left transition-colors',
              !demoOn
                ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/40'
                : 'border-border hover:border-primary/30',
            )}
          >
            <div className="text-sm font-medium">Plată înainte</div>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              Checkout imediat, fără demo. Pe lista de site-uri apare badge-ul „Plată întâi”.
            </p>
          </button>
        </div>
      </StudioSection>

      <StudioSection
        title="Dedicație și cadou"
        help="Suprataxa pe suma dedicației și prețul unui cod cadou single."
      >
        <Card>
          <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Dedicație — procent"
              fieldId="price.tip"
              description="Procent din suma dedicației. Default 5%."
            >
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.tipSurchargePercent ?? 5}
                  onChange={(e) => setForm({ ...form, tipSurchargePercent: Number(e.target.value) })}
                  className="pr-10 tabular-nums"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  %
                </span>
              </div>
            </Field>
            <Field
              label="Dedicație — plafon"
              description="Suprataxă maximă, indiferent de sumă. Default 50,00."
            >
              <MoneyInput
                cents={form.tipSurchargeCapCents ?? 5000}
                currency={currency}
                placeholder="50,00"
                onChange={(cents) => setForm({ ...form, tipSurchargeCapCents: cents ?? 0 })}
              />
            </Field>
            <Field
              label="Preț cadou"
              fieldId="price.gift"
              description="Un singur cod cadou. Folosit pe /cadou."
            >
              <MoneyInput
                cents={form.giftPriceCents}
                currency={currency}
                onChange={(cents) => setForm({ ...form, giftPriceCents: cents ?? 0 })}
              />
            </Field>
          </CardContent>
        </Card>
      </StudioSection>

      <StudioSection
        title="Stripe pe extrasul de card"
        help="Un singur cont Stripe pentru toate site-urile. Astea sunt textele de pe factură / extras."
      >
        <Card>
          <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Nume produs"
              fieldId="price.stripe"
              description="Apare pe factura Stripe. Gol = default-ul contului."
            >
              <Input
                value={form.stripe?.productName ?? ''}
                onChange={(e) =>
                  setForm({ ...form, stripe: { ...form.stripe, productName: e.target.value } })
                }
                placeholder="Manea personalizată"
              />
            </Field>
            <Field
              label="Descriptor extras"
              description="Max 22 caractere. Ce vede clientul pe extrasul bancar."
            >
              <Input
                value={form.stripe?.statementDescriptor ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    stripe: { ...form.stripe, statementDescriptor: e.target.value.slice(0, 22) },
                  })
                }
                maxLength={22}
                placeholder="MANELE CADOU"
              />
              <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                {(form.stripe?.statementDescriptor ?? '').length}/22
              </p>
            </Field>
          </CardContent>
        </Card>
      </StudioSection>

      <details className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium select-none">
          Avansat — prețuri legacy
        </summary>
        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border pt-4">
          <p className="sm:col-span-2 text-[11px] text-muted-foreground leading-snug">
            Încă folosite pe interfața classic (CTA), termeni și upgrade-ul Premium vechi. Pachetele de
            mai sus sunt modelul nou. HUF e tot /100 — nu e zero-decimal Stripe.
          </p>
          <Field
            label="Preț bază"
            fieldId="price.legacy"
            description="CTA pe classic și prețul din termeni. Nu e pachetul Standard."
          >
            <MoneyInput
              cents={form.basePriceCents}
              currency={currency}
              onChange={(cents) => setForm({ ...form, basePriceCents: cents ?? 0 })}
            />
          </Field>
          <Field
            label="Preț tăiat (strikethrough vechi)"
            description="0 sau gol = nu se afișează. Folosit pe wizardul Cadou ca fallback."
          >
            <MoneyInput
              cents={form.standardPriceCents}
              currency={currency}
              placeholder="fără tăiere"
              onChange={(cents) => setForm({ ...form, standardPriceCents: cents ?? 0 })}
            />
          </Field>
          <Field
            label="Upgrade Premium — extra"
            description="Cât costă în plus opțiunea Manea Premium pe modelul vechi. Default 20,00."
          >
            <MoneyInput
              cents={form.premiumExtraCents ?? 2000}
              currency={currency}
              placeholder="20,00"
              onChange={(cents) => setForm({ ...form, premiumExtraCents: cents ?? 0 })}
            />
          </Field>
          <Field
            label="Stripe price ID"
            fieldId="price.priceId"
            description="Opțional. Lasă gol dacă prețul e dinamic din pachete."
          >
            <Input
              value={form.stripe?.priceId ?? ''}
              onChange={(e) =>
                setForm({ ...form, stripe: { ...form.stripe, priceId: e.target.value || null } })
              }
              placeholder="price_…"
            />
          </Field>
        </div>
      </details>
    </div>
  );
}
