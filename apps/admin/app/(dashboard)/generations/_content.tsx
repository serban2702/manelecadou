'use client';

import { useAsync } from "@/lib/hooks/use-async";
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { ExternalLink, Music2, Trash2, Unlock } from 'lucide-react';
import { AdminApi } from '@/lib/api';
import { Badge, type BadgeProps } from '@/components/ui/badge';
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

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  succeeded: 'success',
  failed: 'destructive',
  running: 'warning',
  queued: 'muted',
  pending: 'muted',
  writing_lyrics: 'info',
  checking_lyrics: 'info',
  generating_audio: 'warning',
};

export default function GenerationsPage() {
  const { toast } = useToast();
  const { isAllSelected } = useSitesMap();
  const { data, loading: isLoading, refetch } = useAsync(
    () => AdminApi.generations(),
    [],
    { refetchInterval: 5000 },
  );

  async function forceUnlock(id: string) {
    const ok = await confirmDialog({
      title: 'Force unlock?',
      description: 'Marchează generation ca paid fără plată. Acțiune ireversibilă.',
      confirmText: 'Unlock',
    });
    if (!ok) return;
    await AdminApi.generationForceUnlock(id);
    toast({ variant: 'success', title: 'Unlocked' });
    refetch();
  }

  async function del(id: string) {
    const ok = await confirmDialog({
      title: 'Ștergi generation?',
      description: 'Nu se mai poate recupera.',
      confirmText: 'Șterge',
      variant: 'destructive',
    });
    if (!ok) return;
    await AdminApi.generationDelete(id);
    toast({ variant: 'success', title: 'Generation ștearsă' });
    refetch();
  }

  return (
    <div>
      <PageHeader
        title="Generări"
        description="Toate piesele generate · refresh la 5 secunde"
      />

      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (data ?? []).length === 0 ? (
        <Empty icon={<Music2 className="h-5 w-5" />} title="Nicio generare încă" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Creată</TableHead>
              {isAllSelected && <TableHead>Site</TableHead>}
              <TableHead>Tip</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Unlock</TableHead>
              <TableHead>Destinatar</TableHead>
              <TableHead>Style / Voice</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Audio</TableHead>
              <TableHead className="text-right">Acțiuni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data!.map((g) => {
              const paid = (g as { paidUnlocked?: boolean }).paidUnlocked;
              return (
                <TableRow key={g.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(g.createdAt), "d MMM 'la' HH:mm", { locale: ro })}
                  </TableCell>
                  {isAllSelected && (
                    <TableCell>
                      <SiteBadge siteId={g.siteId} />
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge variant={g.type === 'demo' ? 'info' : 'success'}>{g.type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[g.status] ?? 'muted'}>{g.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {paid ? (
                      <Badge variant="success">paid</Badge>
                    ) : (
                      <Badge variant="muted">demo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{g.recipientName}</TableCell>
                  <TableCell className="text-xs">
                    <code>{g.style}</code> <span className="text-muted-foreground">/</span>{' '}
                    <code>{g.voiceArtist}</code>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {g.ownerUserId ? (
                      <code title={g.ownerUserId}>user:{g.ownerUserId.slice(0, 8)}</code>
                    ) : g.ownerGuestId ? (
                      <code title={g.ownerGuestId}>guest:{g.ownerGuestId.slice(0, 8)}</code>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    {g.audioUrl ? (
                      <a
                        href={g.audioUrl}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        MP3
                      </a>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5">
                      {!paid && (
                        <Button variant="success" size="xs" onClick={() => forceUnlock(g.id)}>
                          <Unlock />
                          Unlock
                        </Button>
                      )}
                      <Button variant="destructive" size="icon-sm" onClick={() => del(g.id)} aria-label="Șterge">
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
