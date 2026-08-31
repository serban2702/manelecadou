'use client';

import type { SiteDto } from '@/lib/api/sites.api';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Field } from './studio-primitives';
import { MASKED_SECRET } from './studio-constants';

export function MailConfigSection({
  form,
  setForm,
}: {
  form: SiteDto;
  setForm: (f: SiteDto) => void;
}) {
  const mc = form.mailConfig ?? {};
  const provider = mc.provider ?? null;

  function patch(next: Partial<NonNullable<SiteDto['mailConfig']>>) {
    setForm({ ...form, mailConfig: { ...mc, ...next } });
  }
  function patchSmtp(next: Partial<NonNullable<NonNullable<SiteDto['mailConfig']>['smtp']>>) {
    setForm({ ...form, mailConfig: { ...mc, smtp: { ...(mc.smtp ?? {}), ...next } } });
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Server de email</div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Alege pe unde se trimit mailurile pentru acest site (login, melodie gata, chitanță, recovery).
            Lasă pe „Implicit (global)" ca să folosești transportul comun din Setări.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {([
            { v: null, label: 'Implicit (global)' },
            { v: 'powermail' as const, label: 'PowerMail' },
            { v: 'smtp' as const, label: 'SMTP' },
          ]).map((opt) => {
            const active = provider === opt.v;
            return (
              <button
                key={String(opt.v)}
                type="button"
                onClick={() => patch({ provider: opt.v })}
                className={`text-xs px-3 py-2 rounded border transition-colors ${
                  active
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-secondary/30'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="Expeditor (override)"
            description={'Dacă e gol, folosește „Expeditor" de mai sus. Pe PowerMail, adresa asta alege identitatea verificată din proiect.'}
          >
            <Input
              value={mc.fromEmail ?? ''}
              onChange={(e) => patch({ fromEmail: e.target.value })}
              placeholder="noreply@domeniul-tau.com"
            />
          </Field>
          <Field label="Nume expeditor">
            <Input
              value={mc.fromName ?? ''}
              onChange={(e) => patch({ fromName: e.target.value })}
              placeholder="ЧалгаПодарък / ManeleCadou"
            />
          </Field>
          <Field label="Răspunde la (opțional)">
            <Input
              value={mc.replyTo ?? ''}
              onChange={(e) => patch({ replyTo: e.target.value })}
              placeholder="support@..."
            />
          </Field>
        </div>

        {provider === 'powermail' && (
          <div className="border-t border-border pt-3 text-[11px] text-muted-foreground leading-snug">
            PowerMail n-are credențiale per-site: cheia de proiect e una singură, în{' '}
            <span className="text-foreground">Setări → Chei</span>. Aici alegi doar identitatea de mai
            sus — și ea trebuie să existe verificată în proiectul PowerMail, altfel trimiterea
            întoarce „expeditor neautorizat".
          </div>
        )}

        {provider === 'smtp' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border pt-3">
            <div className="col-span-full text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Credențiale SMTP
            </div>
            <Field label="Server">
              <Input
                value={mc.smtp?.host ?? ''}
                onChange={(e) => patchSmtp({ host: e.target.value })}
                placeholder="smtp.gmail.com / smtp.sendgrid.net"
              />
            </Field>
            <Field label="Port">
              <Input
                type="number"
                value={mc.smtp?.port ?? ''}
                onChange={(e) => patchSmtp({ port: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="587 / 465"
              />
            </Field>
            <Field label="Utilizator">
              <Input
                value={mc.smtp?.user ?? ''}
                onChange={(e) => patchSmtp({ user: e.target.value })}
                placeholder="apikey / contul-tau@..."
              />
            </Field>
            <Field label="Parolă" description="Lasă necompletat pentru a păstra parola existentă.">
              <Input
                type="password"
                value={mc.smtp?.pass ?? ''}
                onChange={(e) => patchSmtp({ pass: e.target.value })}
                placeholder={mc.smtp?.pass === MASKED_SECRET ? '••••••••' : ''}
              />
            </Field>
            <Field label="TLS direct (port 465)" description="Pornit = TLS pe 465. Oprit = STARTTLS pe 587.">
              <Switch
                checked={!!mc.smtp?.secure}
                onCheckedChange={(v) => patchSmtp({ secure: v })}
              />
            </Field>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
