'use client';

import { useState } from 'react';
import { useAsync } from "@/lib/hooks/use-async";
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { CreditCard } from 'lucide-react';
import { AdminApi, AnalyticsApi } from '@/lib/api';
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
              <TableHead>Status</TableHead>
              <TableHead>Owner</TableHead>
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
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <Badge variant={STATUS_VARIANT[p.status] ?? 'muted'}>{p.status}</Badge>
                    {p.status === 'failed' && (p.failureReason || p.failureCode) && (
                      <span
                        className="text-[10px] text-rose-300/80 line-clamp-1 max-w-[260px]"
                        title={`${p.failureCode ?? ''}${p.failureCode && p.failureReason ? ' — ' : ''}${p.failureReason ?? ''}`}
                      >
                        {p.failureCode ? `${p.failureCode}: ` : ''}{p.failureReason ?? '—'}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {p.userId
                    ? `user:${p.userId.slice(0, 8)}`
                    : p.guestId
                      ? `guest:${p.guestId.slice(0, 8)}`
                      : '—'}
                </TableCell>
                <TableCell>
                  <code className="text-xs text-muted-foreground">{p.id.slice(0, 8)}</code>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {selectedId && <PaymentDetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function PaymentDetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, loading } = useAsync(() => AnalyticsApi.paymentDetail(id), [id]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[hsl(220_22%_9%)] p-5 text-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Plată {id.slice(0, 8)}…</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-white">
            ✕
          </button>
        </div>
        {loading ? (
          <Skeleton className="h-96 w-full" />
        ) : !data ? (
          <Empty title="Eroare" />
        ) : (
          <div className="space-y-4">
            <Section title="Plată">
              <Kv k="ID" v={data.payment.id} />
              <Kv k="Sumă" v={`${(data.payment.amount / 100).toFixed(2)} ${data.payment.currency}`} />
              {data.payment.amountRonCents != null && (
                <Kv k="În RON" v={`${(data.payment.amountRonCents / 100).toFixed(2)} RON`} />
              )}
              {data.payment.exchangeRateToRon && (
                <Kv k="Curs" v={data.payment.exchangeRateToRon} />
              )}
              <Kv k="Status" v={<Badge variant={STATUS_VARIANT[data.payment.status] ?? 'muted'}>{data.payment.status}</Badge>} />
              {data.payment.status === 'failed' && (data.payment.failureReason || data.payment.failureCode) && (
                <>
                  {data.payment.failureCode && (
                    <Kv k="Cod eșec" v={<code className="text-rose-300">{data.payment.failureCode}</code>} />
                  )}
                  {data.payment.failureReason && (
                    <div className="border-b border-white/5 py-1 text-xs">
                      <div className="text-muted-foreground mb-1">Motiv eșec</div>
                      <div className="text-rose-200 whitespace-pre-wrap">{data.payment.failureReason}</div>
                    </div>
                  )}
                </>
              )}
              <Kv k="Provider" v={data.payment.provider} />
              <Kv k="Stripe session" v={data.payment.providerSessionId ?? '—'} mono />
              <Kv k="Creat" v={format(new Date(data.payment.createdAt), "d MMM yyyy HH:mm", { locale: ro })} />
            </Section>

            {data.user && (
              <Section title="User">
                <Kv k="Email" v={data.user.email} />
                <Kv k="Nume" v={data.user.name ?? '—'} />
                <Kv k="ID" v={data.user.id} mono />
              </Section>
            )}

            {data.session && (
              <Section title="Sesiune originală">
                <Kv k="Geo" v={`${data.session.countryName ?? data.session.country ?? '—'} · ${data.session.city ?? '—'}`} />
                <Kv k="IP" v={data.session.ip ?? '—'} mono />
                <Kv k="Browser" v={`${data.session.browserName ?? '—'} ${data.session.browserVersion ?? ''}`} />
                <Kv k="OS" v={`${data.session.osName ?? '—'} ${data.session.osVersion ?? ''}`} />
                <Kv k="Device" v={data.session.device ?? '—'} />
                <Kv k="Sursă" v={`${data.session.source ?? 'direct'}${data.session.medium ? ` / ${data.session.medium}` : ''}`} />
                {data.session.campaign && <Kv k="Campanie" v={data.session.campaign} />}
                {data.session.referrer && <Kv k="Referrer" v={data.session.referrer} />}
                {data.session.landingPath && <Kv k="Landing" v={data.session.landingPath} />}
              </Section>
            )}

            {data.relatedEvent && data.relatedEvent.props && (
              <Section title="Props eveniment">
                <pre className="overflow-x-auto rounded bg-black/40 p-2 text-[11px]">
                  {JSON.stringify(data.relatedEvent.props, null, 2)}
                </pre>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Kv({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-white/5 py-1 text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span className={mono ? 'truncate font-mono' : 'truncate text-right'}>{v}</span>
    </div>
  );
}
