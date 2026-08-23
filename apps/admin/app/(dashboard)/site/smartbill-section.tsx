'use client';

import { useState } from 'react';
import type { SiteDto } from '@/lib/api/sites.api';
import { InvoicesApi } from '@/lib/api/invoices.api';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Field } from './studio-primitives';
import { MASKED_SECRET } from './studio-constants';

/**
 * Tokenul vine mascat ca __MASKED__ când e setat; lăsat necompletat → se păstrează.
 * Butonul „Testează conexiunea" validează credențialele SALVATE (apasă Salvează întâi).
 */
export function SmartbillSection({
  siteId,
  form,
  setForm,
}: {
  siteId: string;
  form: SiteDto;
  setForm: (f: SiteDto) => void;
}) {
  const { toast } = useToast();
  const sb = form.smartbill ?? {};
  const dc = sb.defaultClient ?? {};
  const [testing, setTesting] = useState(false);

  const patch = (p: Partial<NonNullable<SiteDto['smartbill']>>) =>
    setForm({ ...form, smartbill: { ...sb, ...p } });
  const patchClient = (p: Partial<NonNullable<NonNullable<SiteDto['smartbill']>['defaultClient']>>) =>
    setForm({ ...form, smartbill: { ...sb, defaultClient: { ...dc, ...p } } });

  const runTest = async () => {
    setTesting(true);
    try {
      const res = await InvoicesApi.testConnection(siteId);
      if (res.ok) {
        toast({
          title: 'Conexiune OK',
          description: res.series.length
            ? `Serii găsite: ${res.series.join(', ')}`
            : 'Credențiale valide (nicio serie configurată în SmartBill).',
        });
      } else {
        toast({ title: 'Eșuat', description: res.message ?? 'Eroare necunoscută', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Eșuat', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Facturare (SmartBill)
          </div>
          <Switch checked={!!sb.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">
          Firmă neplătitoare de TVA → facturile se emit cu cotă 0%. Tokenul îl iei din SmartBill →
          Contul meu → Integrări → API. Seria trebuie creată manual în SmartBill înainte.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Email cont SmartBill">
            <Input
              value={sb.email ?? ''}
              onChange={(e) => patch({ email: e.target.value })}
              placeholder="contul@firma.ro"
            />
          </Field>
          <Field label="Token API" description="Lasă necompletat pentru a păstra tokenul existent.">
            <Input
              type="password"
              value={sb.token ?? ''}
              onChange={(e) => patch({ token: e.target.value })}
              placeholder={sb.token === MASKED_SECRET ? '••••••••' : 'token...'}
            />
          </Field>
          <Field label="CIF firmă" description="Fără „RO” pentru neplătitor de TVA.">
            <Input
              value={sb.companyVatCode ?? ''}
              onChange={(e) => patch({ companyVatCode: e.target.value })}
              placeholder="40123456"
            />
          </Field>
          <Field label="Serie facturi" description="Exact ca în SmartBill (ex. MEL).">
            <Input
              value={sb.seriesName ?? ''}
              onChange={(e) => patch({ seriesName: e.target.value })}
              placeholder="MEL"
            />
          </Field>
          <Field label="Serie plată / încasare" description="Seria chitanței/încasării (ex. PLATA_MEL). Lasă gol dacă nu folosești.">
            <Input
              value={sb.paymentSeriesName ?? ''}
              onChange={(e) => patch({ paymentSeriesName: e.target.value })}
              placeholder="PLATA_MEL"
            />
          </Field>
          <Field label="Denumire produs/serviciu">
            <Input
              value={sb.productName ?? ''}
              onChange={(e) => patch({ productName: e.target.value })}
              placeholder="Melodie personalizată"
            />
          </Field>
          <Field label="Unitate de măsură">
            <Input
              value={sb.measuringUnit ?? ''}
              onChange={(e) => patch({ measuringUnit: e.target.value })}
              placeholder="buc"
            />
          </Field>
          <Field label="Tip plată (încasare)" description="Apare ca încasare pe factură (factura iese încasată).">
            <select
              value={sb.paymentType ?? 'Card'}
              onChange={(e) => patch({ paymentType: e.target.value })}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="Card">Card</option>
              <option value="Ordin de plata">Ordin de plată</option>
              <option value="Chitanta">Chitanță</option>
              <option value="Bon">Bon</option>
            </select>
          </Field>
        </div>

        <div className="border-t border-border pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider">Client implicit</div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Dacă e activ, facturile se emit pe acest client (ex. persoana ta fizică) în loc de
                cumpărătorul real. Util pentru facturile istorice. Poți edita oricum datele în preview.
              </p>
            </div>
            <Switch checked={!!sb.useDefaultClient} onCheckedChange={(v) => patch({ useDefaultClient: v })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nume / Denumire">
              <Input value={dc.name ?? ''} onChange={(e) => patchClient({ name: e.target.value })} placeholder="Nume Prenume" />
            </Field>
            <Field label="CIF / CUI client">
              <Input
                value={dc.vatCode ?? ''}
                onChange={(e) => patchClient({ vatCode: e.target.value })}
                placeholder="40123456"
              />
            </Field>
            <Field label="Reg. com. client">
              <Input
                value={dc.regCom ?? ''}
                onChange={(e) => patchClient({ regCom: e.target.value })}
                placeholder="J40/1234/2020"
              />
            </Field>
            <Field label="Adresă">
              <Input value={dc.address ?? ''} onChange={(e) => patchClient({ address: e.target.value })} />
            </Field>
            <Field label="Oraș">
              <Input value={dc.city ?? ''} onChange={(e) => patchClient({ city: e.target.value })} />
            </Field>
            <Field label="Județ">
              <Input value={dc.county ?? ''} onChange={(e) => patchClient({ county: e.target.value })} />
            </Field>
            <Field label="Țară" description="Cod ISO, default RO.">
              <Input
                value={dc.country ?? ''}
                onChange={(e) => patchClient({ country: e.target.value })}
                placeholder="RO"
              />
            </Field>
            <Field label="Email client">
              <Input
                type="email"
                value={dc.email ?? ''}
                onChange={(e) => patchClient({ email: e.target.value })}
                placeholder="client@…"
              />
            </Field>
            <div className="sm:col-span-2">
              <label className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-border cursor-pointer hover:bg-secondary/30">
                <span className="text-sm">
                  Plătitor de TVA
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    ON = factură cu TVA. OFF = cotă 0% pe clientul implicit.
                  </span>
                </span>
                <Switch
                  checked={!!dc.isTaxPayer}
                  onCheckedChange={(v) => patchClient({ isTaxPayer: v })}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button type="button" variant="outline" size="sm" onClick={runTest} disabled={testing}>
            {testing ? 'Se testează…' : 'Testează conexiunea'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
