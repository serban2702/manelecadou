'use client';

import { useEffect, useState } from 'react';
import { useAsync } from "@/lib/hooks/use-async";
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { ArrowDownToLine, ArrowUpFromLine, ShieldCheck, UserCircle2, UserPlus } from 'lucide-react';
import { AdminApi } from '@/lib/api';
import { SitesApi, type SiteDto } from '@/lib/api/sites.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Empty } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { SiteBadge } from '@/components/site-badge';
import { useSitesMap } from '@/lib/hooks/use-sites-map';

export default function UsersPage() {
  const { toast } = useToast();
  const { isAllSelected } = useSitesMap();
  const [createOpen, setCreateOpen] = useState(false);
  const { data, loading: isLoading, refetch } = useAsync(
    () => AdminApi.users(),
    [],
    { refetchInterval: 10_000 },
  );

  async function toggleRole(id: string, current: 'user' | 'admin', email: string) {
    const next = current === 'admin' ? 'user' : 'admin';
    const ok = await confirmDialog({
      title: `Schimbi rolul lui ${email}?`,
      description: (
        <>
          Userul va deveni <b>{next}</b>.
        </>
      ),
      confirmText: next === 'admin' ? 'Promovează' : 'Retrogradează',
      variant: next === 'admin' ? 'default' : 'destructive',
    });
    if (!ok) return;
    await AdminApi.userSetRole(id, next);
    toast({ variant: 'success', title: `Rol setat: ${next}` });
    refetch();
  }

  return (
    <div>
      <PageHeader
        title="Utilizatori"
        description="Refresh la 10 secunde"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" /> Utilizator nou
          </Button>
        }
      />

      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (data ?? []).length === 0 ? (
        <Empty
          icon={<UserCircle2 className="h-5 w-5" />}
          title="Niciun utilizator înregistrat"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Înregistrat</TableHead>
              {isAllSelected && <TableHead>Site</TableHead>}
              <TableHead>Email</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>ID</TableHead>
              <TableHead className="text-right">Acțiuni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data!.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="text-xs text-muted-foreground">
                  {format(new Date(u.createdAt), "d MMM yyyy 'la' HH:mm", { locale: ro })}
                </TableCell>
                {isAllSelected && (
                  <TableCell>
                    <SiteBadge siteId={u.siteId} />
                  </TableCell>
                )}
                <TableCell className="font-medium">{u.email}</TableCell>
                <TableCell>
                  <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role}</Badge>
                </TableCell>
                <TableCell>
                  <code className="text-xs text-muted-foreground">{u.id.slice(0, 8)}</code>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => toggleRole(u.id, u.role, u.email)}
                    >
                      {u.role === 'admin' ? <ArrowDownToLine /> : <ArrowUpFromLine />}
                      {u.role === 'admin' ? 'Demote' : 'Promote'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          refetch();
        }}
      />
    </div>
  );
}

/**
 * Modal de creare user (inclusiv admini). Userii sunt unici pe (siteId, email);
 * pentru admini site-ul corect e cel DEFAULT — magic link-ul cerut de pe
 * admin.manelecadou.ro caută userul pe site-ul default (vezi AuthService).
 */
function CreateUserDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [siteId, setSiteId] = useState('');
  const [sites, setSites] = useState<SiteDto[]>([]);
  const [saving, setSaving] = useState(false);

  // Lista de site-uri pentru select; preselectăm site-ul default.
  useEffect(() => {
    if (!open) return;
    SitesApi.list()
      .then((all) => {
        setSites(all);
        const def = all.find((s) => s.isDefault) ?? all[0];
        setSiteId((prev) => prev || def?.id || '');
      })
      .catch(() => setSites([]));
  }, [open]);

  const defaultSite = sites.find((s) => s.isDefault);
  const adminOnWrongSite =
    role === 'admin' && !!defaultSite && !!siteId && siteId !== defaultSite.id;

  async function save() {
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast({ variant: 'destructive', title: 'Email invalid' });
      return;
    }
    if (!siteId) {
      toast({ variant: 'destructive', title: 'Alege un site' });
      return;
    }
    setSaving(true);
    try {
      await AdminApi.userCreate({
        email: cleanEmail,
        name: name.trim() || undefined,
        role,
        siteId,
      });
      toast({
        variant: 'success',
        title: 'Utilizator creat',
        description:
          role === 'admin'
            ? `${cleanEmail} se poate loga acum cu magic link din admin.`
            : cleanEmail,
      });
      setEmail('');
      setName('');
      setRole('user');
      onCreated();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Utilizator nou</DialogTitle>
          <DialogDescription>
            Creează un cont manual (inclusiv admin). Userul se loghează prin magic link — nu
            există parolă.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Email" className="md:col-span-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nume@exemplu.ro"
              autoFocus
            />
          </Field>
          <Field label="Nume (opțional)" className="md:col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="opțional" />
          </Field>
          <Field label="Rol">
            <Select value={role} onValueChange={(v) => setRole(v as 'user' | 'admin')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">user</SelectItem>
                <SelectItem value="admin">admin</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Site">
            <Select value={siteId} onValueChange={setSiteId}>
              <SelectTrigger>
                <SelectValue placeholder="Alege site-ul" />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.domain}){s.isDefault ? ' · default' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {role === 'admin' && (
            <div
              className={
                'md:col-span-2 flex items-start gap-2 rounded-md border p-3 text-xs ' +
                (adminOnWrongSite
                  ? 'border-destructive/40 bg-destructive/10 text-destructive'
                  : 'border-border bg-secondary/40 text-muted-foreground')
              }
            >
              <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                {adminOnWrongSite ? (
                  <>
                    Adminii trebuie creați pe site-ul <b>default ({defaultSite?.domain})</b> —
                    magic link-ul cerut din admin caută contul acolo. Pe alt site, la login se
                    creează un duplicat fără drepturi.
                  </>
                ) : (
                  <>
                    După creare, persoana cere magic link cu acest email direct din pagina de
                    login a adminului și primește acces complet.
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Anulează</Button>
          <Button onClick={save} loading={saving} disabled={adminOnWrongSite}>
            Creează
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
