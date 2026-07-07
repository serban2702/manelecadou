'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Database,
  Download,
  FlaskConical,
  HardDriveDownload,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Undo2,
} from 'lucide-react';
import { DatabaseApi, type DbBackup } from '@/lib/api';
import { setOpsCredential } from '@/lib/http/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAsync } from '@/lib/hooks/use-async';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty } from '@/components/ui/empty';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { promptDialog } from '@/components/ui/prompt-dialog';
import { useToast } from '@/components/ui/use-toast';

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('ro-RO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Zonă protejată exact ca terminalul Claude Ops (cerință 2026-07-07): pe lângă
 * JWT-ul de admin, backend-ul (OpsCredentialGuard) cere user:parolă din
 * OPS_TERMINAL_CREDENTIAL. Verificăm cu un info() — 403 = gate; altfel intrăm.
 */
export default function DatabaseAdminPage() {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);

  useEffect(() => {
    DatabaseApi.info()
      .then(() => setUnlocked(true))
      .catch((e) => {
        const status = (e as { status?: number }).status;
        // Doar 403 = credential ops lipsă/greșit. Alte erori le lăsăm să apară
        // în pagină (nu blocăm accesul pentru un 5xx tranzitoriu).
        setUnlocked(status === 403 ? false : true);
      });
  }, []);

  if (unlocked === null) {
    return (
      <div>
        <PageHeader title="Database" description="Se verifică accesul…" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (!unlocked) return <OpsCredentialGate onUnlocked={() => setUnlocked(true)} />;
  return <DatabaseAdminInner />;
}

/** Formular de deblocare — aceleași user + parolă ca la terminalul web (ttyd). */
function OpsCredentialGate({ onUnlocked }: { onUnlocked: () => void }) {
  const { toast } = useToast();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);

  async function unlock() {
    if (!user.trim() || !pass) {
      toast({ variant: 'destructive', title: 'Completează userul și parola' });
      return;
    }
    setBusy(true);
    setOpsCredential(`${user.trim()}:${pass}`);
    try {
      await DatabaseApi.info();
      onUnlocked();
    } catch {
      setOpsCredential(null);
      toast({ variant: 'destructive', title: 'Credențiale greșite', description: 'Folosește userul și parola de la terminalul Claude Ops.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Database" description="Zonă protejată — backup, restore și reset pe baza de date" />
      <div className="max-w-md mx-auto mt-10">
        <Card className="surface">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-5 w-5 text-primary" /> Acces restricționat
            </CardTitle>
            <CardDescription>
              Pagina de Database e protejată la fel ca terminalul Claude Ops. Introdu
              aceleași user și parolă (Basic Auth-ul terminalului).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <Label>User</Label>
              <Input value={user} onChange={(e) => setUser(e.target.value)} autoFocus autoComplete="off" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Parolă</Label>
              <Input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void unlock(); }}
                autoComplete="off"
              />
            </div>
            <Button className="w-full" onClick={unlock} loading={busy}>
              <KeyRound className="h-4 w-4" /> Deblochează
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DatabaseAdminInner() {
  const { toast } = useToast();
  const { data: info } = useAsync(() => DatabaseApi.info(), []);
  const { data: backups, loading, refetch } = useAsync(() => DatabaseApi.listBackups(), [], {
    refetchInterval: 10_000,
  });
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function handleCreate() {
    const label = await promptDialog({
      title: 'Backup nou',
      description: 'Adaugă o etichetă opțională (ex: "before-migration"). Doar litere, cifre, _ sau -.',
      label: 'Etichetă',
      placeholder: 'opțional',
      confirmText: 'Creează backup',
    });
    if (label === null) return;
    setBusyAction('create');
    try {
      const b = await DatabaseApi.createBackup(label || undefined);
      toast({
        variant: 'success',
        title: 'Backup creat',
        description: `${b.name} (${fmtSize(b.sizeBytes)})`,
      });
      refetch();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare backup', description: (e as Error).message });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDownload(b: DbBackup) {
    setBusyAction(`dl:${b.name}`);
    try {
      await DatabaseApi.download(b.name);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare descărcare', description: (e as Error).message });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDelete(b: DbBackup) {
    const ok = await confirmDialog({
      title: 'Șterge backup-ul?',
      description: `${b.name} (${fmtSize(b.sizeBytes)}) va fi șters definitiv.`,
      confirmText: 'Șterge',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusyAction(`del:${b.name}`);
    try {
      await DatabaseApi.deleteBackup(b.name);
      toast({ variant: 'success', title: 'Backup șters' });
      refetch();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare ștergere', description: (e as Error).message });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRestore(b: DbBackup) {
    const ok = await confirmDialog({
      title: 'Restaurează din acest backup?',
      description: (
        <div className="space-y-2">
          <p>
            Schema <code>public</code> va fi <strong>ștearsă complet</strong> și înlocuită cu datele
            din <code>{b.name}</code>.
          </p>
          <p className="text-destructive font-medium">
            Toate datele curente se pierd. Operația nu poate fi anulată decât prin restore din alt
            backup.
          </p>
        </div>
      ),
      confirmText: 'Restaurează',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusyAction(`restore:${b.name}`);
    try {
      const r = await DatabaseApi.restoreBackup(b.name);
      toast({
        variant: 'success',
        title: 'Restore complet',
        description: `${fmtSize(r.bytesApplied)} aplicate din ${b.name}`,
      });
      refetch();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare restore', description: (e as Error).message });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleReset() {
    const confirm1 = await confirmDialog({
      title: 'Reset COMPLET al bazei de date?',
      description: (
        <div className="space-y-2">
          <p>
            Schema <code>public</code> va fi ștearsă, recreată de la zero și populată cu datele de
            seed.
          </p>
          <p className="text-destructive font-medium">
            Pierzi tot — useri, generations, payments, conversații. Folosește doar pe DEV.
          </p>
        </div>
      ),
      confirmText: 'Continuă',
      variant: 'destructive',
    });
    if (!confirm1) return;
    const phrase = await promptDialog({
      title: 'Confirmare finală',
      description: 'Tastează RESET pentru a confirma.',
      label: 'Confirmare',
      placeholder: 'RESET',
      confirmText: 'Resetează',
    });
    if (phrase !== 'RESET') {
      if (phrase !== null) {
        toast({ variant: 'destructive', title: 'Reset anulat', description: 'Confirmare incorectă.' });
      }
      return;
    }
    setBusyAction('reset');
    try {
      const r = await DatabaseApi.reset();
      toast({
        variant: 'success',
        title: 'Reset + reseed complet',
        description: `+${r.seeder.users} users, +${r.seeder.generations} generations, +${r.seeder.conversations} conversations`,
      });
      refetch();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare reset', description: (e as Error).message });
    } finally {
      setBusyAction(null);
    }
  }

  const isProd = info?.env === 'production';

  return (
    <div>
      <PageHeader
        title="Bază de date"
        description="Backup, restore și reset pentru baza Postgres."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()} loading={loading}>
              <RefreshCw />
              Refresh
            </Button>
            <Button variant="accent" onClick={handleCreate} loading={busyAction === 'create'}>
              <Plus />
              Backup nou
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card className="surface lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" />
              Conexiune
            </CardTitle>
            <CardDescription>Detalii server Postgres folosit de API.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <Field label="Environment" value={info?.env ?? '—'} highlight={isProd ? 'destructive' : 'success'} />
            <Field label="Host" value={info?.host ?? '—'} />
            <Field label="Database" value={info?.database ?? '—'} />
          </CardContent>
        </Card>

        <Card className="surface border-destructive/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <FlaskConical className="h-4 w-4" />
              Reset complet (DEV)
            </CardTitle>
            <CardDescription>
              Șterge toată schema, recreează tabelele și rulează seeder-ul.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {info && !info.resetAllowed ? (
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <span>Reset interzis pe production. Disponibil doar când <code>NODE_ENV ≠ production</code>.</span>
              </div>
            ) : (
              <Button
                variant="destructive"
                onClick={handleReset}
                loading={busyAction === 'reset'}
                className="w-full"
              >
                <FlaskConical />
                Drop schema + reseed
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="surface">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Backup-uri</CardTitle>
          <CardDescription>
            Fișiere <code>.sql</code> generate cu <code>pg_dump --clean --if-exists</code>. Stocate
            în volumul Docker <code>api_backups</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !backups ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !backups || backups.length === 0 ? (
            <Empty
              icon={<HardDriveDownload />}
              title="Niciun backup încă"
              description='Apasă „Backup nou" ca să creezi primul snapshot.'
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fișier</TableHead>
                  <TableHead className="w-32">Mărime</TableHead>
                  <TableHead className="w-48">Creat la</TableHead>
                  <TableHead className="w-[300px] text-right">Acțiuni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups.map((b) => (
                  <TableRow key={b.name}>
                    <TableCell className="font-mono text-xs">{b.name}</TableCell>
                    <TableCell className="tabular-nums text-sm">{fmtSize(b.sizeBytes)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(b.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(b)}
                          loading={busyAction === `dl:${b.name}`}
                        >
                          <Download />
                          Descarcă
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestore(b)}
                          loading={busyAction === `restore:${b.name}`}
                        >
                          <Undo2 />
                          Restore
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(b)}
                          loading={busyAction === `del:${b.name}`}
                        >
                          <Trash2 className="text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: 'success' | 'destructive';
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </div>
      <div className="mt-1 font-mono text-sm flex items-center gap-2">
        {value}
        {highlight === 'destructive' && <Badge variant="destructive">prod</Badge>}
        {highlight === 'success' && value !== '—' && value !== 'production' && (
          <Badge variant="outline">dev</Badge>
        )}
      </div>
    </div>
  );
}
