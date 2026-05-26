'use client';

import { useState } from 'react';
import { useAsync } from "@/lib/hooks/use-async";
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { CreditCard, Music2 } from 'lucide-react';
import { AdminApi } from '@/lib/api';
import { OrderDetailModal } from '@/components/order-detail-modal';
import { Badge, type BadgeProps } from '@/components/ui/badge';
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
import { SiteBadge } from '@/components/site-badge';
import { useSitesMap } from '@/lib/hooks/use-sites-map';

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  paid: 'success',
  failed: 'destructive',
  pending: 'warning',
  refunded: 'muted',
};

export default function PaymentsPage() {
  const { data, loading: isLoading } = useAsync(() => AdminApi.payments(), []);
  const { isAllSelected } = useSitesMap();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div>
      <PageHeader title="Plăți" description="Toate tranzacțiile (Stripe + alți provideri)" />

      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (data ?? []).length === 0 ? (
        <Empty icon={<CreditCard className="h-5 w-5" />} title="Nicio plată încă" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              {isAllSelected && <TableHead>Site</TableHead>}
              <TableHead>Provider</TableHead>
              <TableHead className="text-right">Sumă</TableHead>
              <TableHead className="w-[110px]">Status</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Comandă</TableHead>
              <TableHead>ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data!.map((p) => (
              <TableRow
                key={p.id}
                className="cursor-pointer hover:bg-white/5"
                onClick={() => setSelectedId(p.id)}
              >
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(p.createdAt), "d MMM yyyy 'la' HH:mm", { locale: ro })}
                </TableCell>
                {isAllSelected && (
                  <TableCell>
                    <SiteBadge siteId={p.siteId} />
                  </TableCell>
                )}
                <TableCell className="capitalize">{p.provider}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {(p.amount / 100).toFixed(2)} {p.currency}
                </TableCell>
                <TableCell className="w-[110px]">
                  <Badge
                    variant={STATUS_VARIANT[p.status] ?? 'muted'}
                    title={
                      p.status === 'failed' && (p.failureReason || p.failureCode)
                        ? `${p.failureCode ?? ''}${p.failureCode && p.failureReason ? ' — ' : ''}${p.failureReason ?? ''}`
                        : undefined
                    }
                  >
                    {p.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">
                  {p.email ?? '—'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {p.userId
                    ? `user:${p.userId.slice(0, 8)}`
                    : p.guestId
                      ? `guest:${p.guestId.slice(0, 8)}`
                      : '—'}
                </TableCell>
                <TableCell className="text-xs">
                  {p.generation ? (
                    <a
                      href={`/m/${p.generation.id}`}
                      target="_blank"
                      rel="noopener"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex flex-col items-start gap-0.5 hover:underline"
                      title={`Generation ${p.generation.id} · ${p.generation.status}`}
                    >
                      <span className="inline-flex items-center gap-1 font-medium">
                        <Music2 className="h-3 w-3" />
                        {p.generation.recipientName}
                      </span>
                      <span className="flex items-center gap-1 text-[10px]">
                        <Badge
                          variant={
                            p.generation.status === 'succeeded'
                              ? 'success'
                              : p.generation.status === 'failed'
                                ? 'destructive'
                                : 'muted'
                          }
                          className="text-[10px]"
                        >
                          {p.generation.status}
                        </Badge>
                        {p.generation.status === 'failed' && p.generation.nextRetryAt && (
                          <span className="text-amber-300">⏱ retry</span>
                        )}
                        {p.generation.paidUnlocked && (
                          <Badge variant="success" className="text-[10px]">paid</Badge>
                        )}
                      </span>
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <code className="text-xs text-muted-foreground">{p.id.slice(0, 8)}</code>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {selectedId && <OrderDetailModal id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
