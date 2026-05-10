'use client';

import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { MailApi, type MailAccountInputDto, type MailAccountSafe, type MailTestResult } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

interface Props {
  open: boolean;
  initial: MailAccountSafe | null;
  onClose: () => void;
  onSaved: () => void;
}

const blank: MailAccountInputDto = {
  label: '',
  email: '',
  fromName: '',
  imapHost: 'imap.gmail.com',
  imapPort: 993,
  imapSecure: true,
  imapUser: '',
  imapPass: '',
  smtpHost: 'smtp.gmail.com',
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: '',
  smtpPass: '',
  signatureHtml: '',
  autoReplyEnabled: false,
  autoReplyThreshold: 0.8,
  syncEnabled: true,
};

export function AccountFormDialog({ open, initial, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState<MailAccountInputDto>(blank);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<MailTestResult | null>(null);

  useEffect(() => {
    if (open) {
      setTestResult(null);
      if (initial) {
        setForm({
          label: initial.label,
          email: initial.email,
          fromName: initial.fromName ?? '',
          imapHost: initial.imapHost,
          imapPort: initial.imapPort,
          imapSecure: initial.imapSecure,
          imapUser: initial.imapUser,
          imapPass: '',
          smtpHost: initial.smtpHost,
          smtpPort: initial.smtpPort,
          smtpSecure: initial.smtpSecure,
          smtpUser: initial.smtpUser,
          smtpPass: '',
          signatureHtml: initial.signatureHtml ?? '',
          autoReplyEnabled: initial.autoReplyEnabled,
          autoReplyThreshold: initial.autoReplyThreshold,
          syncEnabled: initial.syncEnabled,
        });
      } else {
        setForm(blank);
      }
    }
  }, [open, initial]);

  function update<K extends keyof MailAccountInputDto>(k: K, v: MailAccountInputDto[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      let r: MailTestResult;
      if (initial && !form.imapPass && !form.smtpPass) {
        r = await MailApi.accountTestStored(initial.id);
      } else {
        if (!form.imapPass || !form.smtpPass) {
          toast({ variant: 'destructive', title: 'Parolele lipsesc', description: 'Completează ambele parole pentru a testa fără salvare.' });
          return;
        }
        r = await MailApi.accountTestCreds(form);
      }
      setTestResult(r);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Test eșuat', description: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      if (initial) {
        const patch: Partial<MailAccountInputDto> = { ...form };
        if (!form.imapPass) delete patch.imapPass;
        if (!form.smtpPass) delete patch.smtpPass;
        await MailApi.accountUpdate(initial.id, patch);
      } else {
        if (!form.imapPass || !form.smtpPass) {
          toast({ variant: 'destructive', title: 'Parolele lipsesc' });
          setSaving(false);
          return;
        }
        await MailApi.accountCreate(form);
      }
      toast({ variant: 'success', title: 'Cont salvat' });
      onSaved();
      onClose();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editează cont email' : 'Adaugă cont email'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto pr-2">
          <Field label="Etichetă" value={form.label} onChange={(v) => update('label', v)} placeholder="Ex: Suport principal" />
          <Field label="Adresă email" value={form.email} onChange={(v) => update('email', v)} placeholder="contact@manelecadou.ro" />
          <Field label="Nume afișat (From)" value={form.fromName ?? ''} onChange={(v) => update('fromName', v)} placeholder="Manele Cadou — Suport" className="col-span-2" />

          <div className="col-span-2 mt-2 mb-1 text-xs uppercase tracking-wider text-muted-foreground">IMAP (primire)</div>
          <Field label="Host" value={form.imapHost} onChange={(v) => update('imapHost', v)} />
          <Field label="Port" type="number" value={String(form.imapPort)} onChange={(v) => update('imapPort', Number(v))} />
          <Field label="Utilizator" value={form.imapUser} onChange={(v) => update('imapUser', v)} />
          <Field label={`Parolă${initial ? ' (lasă gol = neschimbat)' : ''}`} type="password" value={form.imapPass ?? ''} onChange={(v) => update('imapPass', v)} />
          <ToggleField label="SSL/TLS" value={form.imapSecure} onChange={(v) => update('imapSecure', v)} />

          <div className="col-span-2 mt-2 mb-1 text-xs uppercase tracking-wider text-muted-foreground">SMTP (trimitere)</div>
          <Field label="Host" value={form.smtpHost} onChange={(v) => update('smtpHost', v)} />
          <Field label="Port" type="number" value={String(form.smtpPort)} onChange={(v) => update('smtpPort', Number(v))} />
          <Field label="Utilizator" value={form.smtpUser} onChange={(v) => update('smtpUser', v)} />
          <Field label={`Parolă${initial ? ' (lasă gol = neschimbat)' : ''}`} type="password" value={form.smtpPass ?? ''} onChange={(v) => update('smtpPass', v)} />
          <ToggleField label="SSL/TLS" value={form.smtpSecure} onChange={(v) => update('smtpSecure', v)} />

          <div className="col-span-2 mt-2 mb-1 text-xs uppercase tracking-wider text-muted-foreground">Semnătură HTML (folosită la fiecare email)</div>
          <div className="col-span-2">
            <Textarea
              value={form.signatureHtml ?? ''}
              onChange={(e) => update('signatureHtml', e.target.value)}
              placeholder='<p>Cu drag,<br><strong>Echipa Manele Cadou</strong><br>+40 758 972 277</p>'
              className="min-h-[100px] font-mono text-xs"
            />
          </div>

          <div className="col-span-2 mt-2 mb-1 text-xs uppercase tracking-wider text-muted-foreground">AI auto-reply</div>
          <ToggleField label="Activează răspuns automat" value={!!form.autoReplyEnabled} onChange={(v) => update('autoReplyEnabled', v)} />
          <Field
            label={`Prag confidence (${(form.autoReplyThreshold ?? 0.8).toFixed(2)})`}
            type="number"
            value={String(form.autoReplyThreshold ?? 0.8)}
            onChange={(v) => update('autoReplyThreshold', Math.max(0, Math.min(1, Number(v) || 0)))}
            step="0.05"
          />
          <ToggleField label="Sincronizare activă" value={!!form.syncEnabled} onChange={(v) => update('syncEnabled', v)} />
        </div>

        {testResult && <TestResultPanel result={testResult} />}

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="outline" onClick={test} disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Testează conexiunea
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Renunță</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {initial ? 'Salvează' : 'Adaugă cont'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label, value, onChange, placeholder, type, className, step,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; className?: string; step?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type} step={step} />
    </div>
  );
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-border bg-background/40">
      <Label className="text-sm">{label}</Label>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

function TestResultPanel({ result }: { result: MailTestResult }) {
  const Row = ({ label, ok, error }: { label: string; ok: boolean; error?: string }) => (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-md ${ok ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive'}`}>
      {ok ? <ShieldCheck className="h-4 w-4 mt-0.5" /> : <ShieldAlert className="h-4 w-4 mt-0.5" />}
      <div className="text-sm">
        <div className="font-medium">{label}: {ok ? 'OK' : 'eșec'}</div>
        {!ok && error && <div className="text-xs opacity-80 break-words">{error}</div>}
      </div>
    </div>
  );
  return (
    <div className="space-y-2 mt-3">
      <Row label="IMAP" ok={result.imap.ok} error={result.imap.error} />
      <Row label="SMTP" ok={result.smtp.ok} error={result.smtp.error} />
    </div>
  );
}
