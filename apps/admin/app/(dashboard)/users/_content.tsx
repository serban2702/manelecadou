'use client';

import { useAsync } from "@/lib/hooks/use-async";
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { ArrowDownToLine, ArrowUpFromLine, UserCircle2 } from 'lucide-react';
import { AdminApi } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { confirmDialog } from '@/components/ui/confirm-dialog';
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
import { useToast } from '@/components/ui/use-toast';
import { SiteBadge } from '@/components/site-badge';
import { useSitesMap } from '@/lib/hooks/use-sites-map';

export default function UsersPage() {
  const { toast } = useToast();
  const { isAllSelected } = useSitesMap();
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
      <PageHeader title="Utilizatori" description="Refresh la 10 secunde" />

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
    </div>
  );
}
