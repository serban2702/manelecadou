'use client';

import { useState } from 'react';
import { useAsync, useAsyncCallback } from "@/lib/hooks/use-async";
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { AlertCircle, CheckCircle2, Mail, Pencil, Plus, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { MailApi, type MailAccountSafe } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Empty } from '@/components/ui/empty';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { AccountFormDialog } from '@/components/inbox/AccountFormDialog';

export default function MailAccountsPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MailAccountSafe | null>(null);

  const { data: accounts, loading: isLoading, refetch } = useAsync(
    () => MailApi.accounts(),
    [],
    { refetchInterval: 15_000 },
  );

  const { run: syncMut } = useAsyncCallback(async (id: string) => {
    try {
      await MailApi.accountSync(id);
      toast({ variant: 'success', title: 'Sync programat' });
      refetch();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare sync', description: (e as Error).message });
    }
  });

  const { run: toggleAuto } = useAsyncCallback(async (vars: { id: string; autoReplyEnabled: boolean }) => {
    await MailApi.accountUpdate(vars.id, { autoReplyEnabled: vars.autoReplyEnabled });
    refetch();
  });

  const { run: removeMut } = useAsyncCallback(async (id: string) => {
    await MailApi.accountDelete(id);
    toast({ variant: 'success', title: 'Cont șters' });
    refetch();
  });

  return (
    <div>
      <PageHeader
        title="Conturi email"
        description="Conectează adresele prin IMAP+SMTP. Fiecare cont rulează polling la ~60s."
        actions={
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-4 w-4" /> Adaugă cont
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-44 w-full" />)}
        </div>
      ) : !accounts || accounts.length === 0 ? (
        <Empty
          icon={<Mail className="h-5 w-5" />}
          title="Niciun cont email conectat"
          description="Adaugă o adresă (IMAP+SMTP) ca să începi să primești și să răspunzi la mailuri din admin."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {accounts.map((a) => (
            <Card key={a.id} className="overflow-hidden">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{a.label}</div>
                    <div className="text-xs text-muted-foreground truncate">{a.email}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => syncMut(a.id)} title="Sincronizează acum">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(a); setOpen(true); }} title="Editează">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Șterge contul ${a.email}? Toate mesajele asociate vor fi șterse local.`)) {
                          removeMut(a.id);
                        }
                      }}
                      title="Șterge"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>IMAP: {a.imapHost}:{a.imapPort}{a.imapSecure ? ' (SSL)' : ''}</div>
                  <div>SMTP: {a.smtpHost}:{a.smtpPort}{a.smtpSecure ? ' (SSL)' : ''}</div>
                </div>

                <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-border bg-background/40">
                  <div>
                    <div className="text-sm font-medium">Auto-reply AI</div>
                    <div className="text-xs text-muted-foreground">prag confidence: {a.autoReplyThreshold.toFixed(2)}</div>
                  </div>
                  <Switch
                    checked={a.autoReplyEnabled}
                    onCheckedChange={(v) => toggleAuto({ id: a.id, autoReplyEnabled: v })}
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    {a.lastError ? (
                      <Badge variant="destructive" className="gap-1">
                        <ShieldAlert className="h-3 w-3" /> Eroare
                      </Badge>
                    ) : a.lastSyncAt ? (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Sincronizat
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Nesincronizat</Badge>
                    )}
                    {!a.syncEnabled && <Badge variant="outline">Sync oprit</Badge>}
                  </div>
                  <div className="text-muted-foreground">
                    {a.lastSyncAt ? format(new Date(a.lastSyncAt), "d MMM HH:mm", { locale: ro }) : '—'}
                  </div>
                </div>
                {a.lastError && (
                  <div className="text-xs text-destructive flex items-start gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span className="break-all">{a.lastError}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AccountFormDialog
        open={open}
        initial={editing}
        onClose={() => setOpen(false)}
        onSaved={() => refetch()}
      />
    </div>
  );
}
