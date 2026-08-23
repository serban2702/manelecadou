'use client';

import type { SiteDto } from '@/lib/api/sites.api';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AnalyticsSection } from '../analytics-section';
import { MailConfigSection } from '../mail-config-section';
import { SmartbillSection } from '../smartbill-section';
import { I18N_FIELD_LOCALES, LOCALE_LABELS } from '../studio-constants';
import { Field, StudioSection, Toggle } from '../studio-primitives';

export function OperationsScreen({
  siteId,
  form,
  setForm,
}: {
  siteId: string;
  form: SiteDto;
  setForm: (f: SiteDto) => void;
}) {
  const siteLocale = form.locale || 'ro';

  return (
    <div className="grid gap-6">
      <StudioSection
        title="Site live"
        help="Dacă e vizibil, dacă are HTTPS, dacă e în mentenanță. Ascuns bate mentenanța."
      >
        <div className="grid gap-2">
          <Toggle
            label="Site activ"
            fieldId="operations.active"
            description="Pornit = domeniul e live. Oprit = nu e servit."
            value={form.active}
            onChange={(v) => setForm({ ...form, active: v })}
          />
          <Toggle
            label="HTTPS"
            fieldId="operations.ssl"
            description="Emite certificat Let's Encrypt automat. Trebuie pornit, altfel HTTPS eșuează."
            value={form.sslEnabled}
            onChange={(v) => setForm({ ...form, sslEnabled: v })}
          />
          <Toggle
            label="Mentenanță"
            fieldId="operations.maintenance"
            description="Vizitatorii văd pagina brandită (logo + mesajul de mai jos). IP-urile scutite trec."
            value={form.maintenanceMode}
            onChange={(v) => setForm({ ...form, maintenanceMode: v })}
          />
          <Toggle
            label="Ascuns"
            fieldId="operations.hidden"
            description="Vizitatorul crede că site-ul nu există. Nu e indexat. Are prioritate față de mentenanță."
            value={form.hiddenMode}
            onChange={(v) => setForm({ ...form, hiddenMode: v })}
          />
        </div>
      </StudioSection>

      <StudioSection
        title="Mesaj de mentenanță"
        help="Prima linie = titlu pe pagină. Restul = subtitlu. Limba site-ului e deschisă; celelalte stau în traduceri."
      >
        <Card>
          <CardContent className="p-4">
            <MaintenanceMessageEditor form={form} setForm={setForm} siteLocale={siteLocale} />
          </CardContent>
        </Card>
      </StudioSection>

      <StudioSection
        title="IP-uri scutite"
        help="Câte un IP pe linie. Exact (1.2.3.4) sau prefix (192.168.*). Văd site-ul normal chiar dacă e în mentenanță sau ascuns."
      >
        <Card>
          <CardContent className="p-4">
            <Field label="IP-uri scutite" fieldId="operations.ip">
              <Textarea
                value={(form.ipWhitelist ?? []).join('\n')}
                onChange={(e) =>
                  setForm({
                    ...form,
                    ipWhitelist: e.target.value
                      .split(/\r?\n/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                rows={4}
                placeholder={'1.2.3.4\n192.168.*\n2001:db8::1'}
                className="font-mono text-xs"
              />
            </Field>
          </CardContent>
        </Card>
      </StudioSection>

      <StudioSection
        title="Chat Irina"
        help="Mod pentru conversații noi pe acest site. La schimbare se propagă pe conversațiile existente (apoi poți schimba una câte una din Chat)."
      >
        <Card>
          <CardContent className="p-4 space-y-4">
            <Field
              label="Mod AI default"
              fieldId="operations.ai"
              description="Gol = setarea globală din /settings."
            >
              <select
                value={form.aiChatModeDefault ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    aiChatModeDefault: (e.target.value || null) as 'manual' | 'suggest' | 'auto' | null,
                  })
                }
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
              >
                <option value="">Default global (din /settings)</option>
                <option value="manual">Manual — AI nu intervine</option>
                <option value="suggest">AI Suggest — propune răspunsuri, admin aprobă</option>
                <option value="auto">AI Auto — răspunde direct cu guardrails</option>
              </select>
            </Field>
            <Toggle
              label="Irina salută vizitatorul"
              description="O singură dată per sesiune. Skip pe /m/[id]. Nu are efect dacă modul e Manual."
              value={form.aiGreetingEnabled ?? false}
              onChange={(v) => setForm({ ...form, aiGreetingEnabled: v })}
            />
            <Field
              label="Delay salut (secunde)"
              description="Cât așteaptă după ce vizitatorul se conectează. 1–60, default 5."
            >
              <Input
                type="number"
                min={1}
                max={60}
                value={form.aiGreetingDelaySec ?? 5}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setForm({
                    ...form,
                    aiGreetingDelaySec:
                      Number.isFinite(n) && n > 0 ? Math.min(60, Math.max(1, Math.round(n))) : 5,
                  });
                }}
              />
            </Field>
            <Toggle
              label="Deschide chat-ul la salut"
              description="ON = widget-ul se deschide singur. OFF = doar badge necitit pe iconiță."
              value={form.aiGreetingAutoOpenChat ?? true}
              onChange={(v) => setForm({ ...form, aiGreetingAutoOpenChat: v })}
            />
          </CardContent>
        </Card>
      </StudioSection>

      <StudioSection
        title="Mail"
        help="Adresele de pe acest site. Serverul (Mailgun/SMTP) e mai jos; gol = configul global din /settings."
      >
        <Card>
          <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Expeditor"
              fieldId="operations.mail"
              description="De la cine pleacă login, cadou, melodie gata. Gol = adresa globală din Setări."
            >
              <Input
                value={form.fromEmail ?? ''}
                onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
                placeholder="noreply@…"
              />
            </Field>
            <Field
              label="Email de suport"
              description="Footer și „răspunde la”. Ce vede clientul ca adresă de contact."
            >
              <Input
                value={form.supportEmail ?? ''}
                onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
                placeholder="salut@…"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label="Emailuri interne"
                description="Notificări interne (GDPR, alerte). Separate prin virgulă."
              >
                <Input
                  value={(form.adminEmails ?? []).join(', ')}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      adminEmails: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="tu@firma.ro, coleg@firma.ro"
                />
              </Field>
            </div>
          </CardContent>
        </Card>
        <div className="mt-3">
          <MailConfigSection form={form} setForm={setForm} />
        </div>
      </StudioSection>

      <StudioSection
        title="Date firmă"
        help="Apar pe factură și în termeni. Nu sunt datele SmartBill — alea stau la facturare."
      >
        <Card>
          <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nume legal" fieldId="operations.company">
              <Input
                value={form.companyInfo?.legalName ?? ''}
                onChange={(e) =>
                  setForm({ ...form, companyInfo: { ...form.companyInfo, legalName: e.target.value } })
                }
              />
            </Field>
            <Field label="CUI">
              <Input
                value={form.companyInfo?.cui ?? ''}
                onChange={(e) =>
                  setForm({ ...form, companyInfo: { ...form.companyInfo, cui: e.target.value } })
                }
              />
            </Field>
            <Field label="Reg. com.">
              <Input
                value={form.companyInfo?.regCom ?? ''}
                onChange={(e) =>
                  setForm({ ...form, companyInfo: { ...form.companyInfo, regCom: e.target.value } })
                }
              />
            </Field>
            <Field label="Adresă">
              <Input
                value={form.companyInfo?.address ?? ''}
                onChange={(e) =>
                  setForm({ ...form, companyInfo: { ...form.companyInfo, address: e.target.value } })
                }
              />
            </Field>
            <Field label="IBAN">
              <Input
                value={form.companyInfo?.iban ?? ''}
                onChange={(e) =>
                  setForm({ ...form, companyInfo: { ...form.companyInfo, iban: e.target.value } })
                }
              />
            </Field>
            <Field label="Administrator">
              <Input
                value={form.companyInfo?.ownerName ?? ''}
                onChange={(e) =>
                  setForm({ ...form, companyInfo: { ...form.companyInfo, ownerName: e.target.value } })
                }
              />
            </Field>
          </CardContent>
        </Card>
      </StudioSection>

      <StudioSection
        title="SmartBill"
        help="Facturi fiscale per site. Testează conexiunea după ce salvezi credențialele — butonul citește valorile din DB."
      >
        <div data-field="operations.smartbill" className="scroll-mt-24">
          <SmartbillSection siteId={siteId} form={form} setForm={setForm} />
        </div>
      </StudioSection>

      <AnalyticsSection form={form} setForm={setForm} />

      <details className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium select-none">Intern</summary>
        <div className="px-4 pb-4 border-t border-border pt-4 space-y-3">
          <p className="text-[11px] text-muted-foreground leading-snug">
            Fallback când Host-ul nu se potrivește cu niciun domeniu. Un singur site ar trebui să fie default.
          </p>
          <Toggle
            label="Site default (fallback)"
            description="Folosit când domeniul din request nu e recunoscut."
            value={form.isDefault}
            onChange={(v) => setForm({ ...form, isDefault: v })}
          />
        </div>
      </details>
    </div>
  );
}

function MaintenanceMessageEditor({
  form,
  setForm,
  siteLocale,
}: {
  form: SiteDto;
  setForm: (f: SiteDto) => void;
  siteLocale: string;
}) {
  const bag = form.maintenanceMessage ?? {};
  const others = I18N_FIELD_LOCALES.filter((l) => l !== siteLocale);
  const translated = others.filter((l) => !!bag[l]?.trim()).length;
  const siteName = LOCALE_LABELS[siteLocale as keyof typeof LOCALE_LABELS] ?? siteLocale;

  function patch(loc: string, value: string) {
    setForm({
      ...form,
      maintenanceMessage: { ...bag, [loc]: value },
    });
  }

  return (
    <div className="space-y-3">
      <Field label={`Mesaj (${siteName})`} description="Limba site-ului. Prima linie = titlu.">
        <Textarea
          value={bag[siteLocale] ?? ''}
          onChange={(e) => patch(siteLocale, e.target.value)}
          rows={3}
          placeholder={'Lucrăm la ceva tare.\nRevenim foarte curând.'}
        />
      </Field>
      <details className="rounded-md border border-border bg-background/40">
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium">
          Traduceri — {translated} din {others.length} limbi
        </summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border px-3 pb-3 pt-2">
          {others.map((loc) => (
            <Field key={loc} label={`${LOCALE_LABELS[loc]} (${loc})`}>
              <Textarea
                value={bag[loc] ?? ''}
                onChange={(e) => patch(loc, e.target.value)}
                rows={2}
                placeholder={bag[siteLocale] || ''}
              />
            </Field>
          ))}
        </div>
      </details>
    </div>
  );
}
