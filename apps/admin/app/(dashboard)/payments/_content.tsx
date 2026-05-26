'use client';

import { useState } from 'react';
import { useAsync } from "@/lib/hooks/use-async";
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { CreditCard, Music2, RotateCcw } from 'lucide-react';
import { AdminApi, AnalyticsApi } from '@/lib/api';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { confirmDialog } from '@/components/ui/confirm-dialog';
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
      {selectedId && <PaymentDetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function PaymentDetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { toast } = useToast();
  const { data, loading, refetch } = useAsync(() => AnalyticsApi.paymentDetail(id), [id]);
  const { data: stripeDetails, loading: stripeLoading } = useAsync(
    () => AdminApi.paymentStripeDetails(id),
    [id],
  );
  const [refunding, setRefunding] = useState(false);

  async function handleRefund() {
    if (!data) return;
    const totalLabel = `${(data.payment.amount / 100).toFixed(2)} ${data.payment.currency}`;
    const ok = await confirmDialog({
      title: `Refund ${totalLabel}?`,
      description:
        'Suma va fi returnată integral pe cardul clientului prin Stripe. ' +
        'Statusul plății devine "refunded". Operațiunea NU se poate anula.',
      variant: 'destructive',
    });
    if (!ok) return;
    setRefunding(true);
    try {
      const result = await AdminApi.paymentRefund(id, { reason: 'requested_by_customer' });
      if (result.ok) {
        toast({
          title: 'Refund inițiat',
          description: `${(result.amountCents / 100).toFixed(2)} ${data.payment.currency} returnați — ${result.refundId}`,
        });
        await refetch();
      } else {
        toast({
          variant: 'destructive',
          title: 'Refund eșuat',
          description: result.error,
        });
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Refund eșuat',
        description: (err as Error).message,
      });
    } finally {
      setRefunding(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[hsl(220_22%_9%)] p-5 text-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold">Plată {id.slice(0, 8)}…</h3>
          <div className="flex items-center gap-2">
            {data?.payment.status === 'paid' && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRefund}
                disabled={refunding}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {refunding ? 'Se procesează...' : 'Refund'}
              </Button>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-white">
              ✕
            </button>
          </div>
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

            {data.generation && (
              <Section title="Comandă (generation)">
                <Kv
                  k="Destinatar"
                  v={
                    <a
                      href={`/m/${data.generation.id}`}
                      target="_blank"
                      rel="noopener"
                      className="text-primary hover:underline"
                    >
                      {data.generation.recipientName}
                    </a>
                  }
                />
                <Kv k="ID" v={data.generation.id} mono />
                <Kv k="Tip" v={data.generation.type} />
                <Kv
                  k="Status"
                  v={
                    <Badge
                      variant={
                        data.generation.status === 'succeeded'
                          ? 'success'
                          : data.generation.status === 'failed'
                            ? 'destructive'
                            : 'muted'
                      }
                    >
                      {data.generation.status}
                    </Badge>
                  }
                />
                <Kv k="Deblocat (paid)" v={data.generation.paidUnlocked ? 'da' : 'nu'} />
                {data.generation.retryCount > 0 && (
                  <Kv k="Încercări" v={String(data.generation.retryCount)} />
                )}
                {data.generation.nextRetryAt && (
                  <Kv
                    k="Auto-retry"
                    v={
                      <span className="text-amber-300">
                        {format(new Date(data.generation.nextRetryAt), "d MMM HH:mm:ss", { locale: ro })}
                      </span>
                    }
                  />
                )}
                {data.generation.audioUrl && (
                  <Kv
                    k="Audio"
                    v={
                      <a
                        href={data.generation.audioUrl}
                        target="_blank"
                        rel="noopener"
                        className="text-primary hover:underline"
                      >
                        MP3 ↗
                      </a>
                    }
                  />
                )}
                <div className="pt-2">
                  <a
                    href={`/generations?focus=${data.generation.id}`}
                    className="text-xs text-primary hover:underline"
                  >
                    → Vezi în Generări (retry / upload manual / unlock)
                  </a>
                </div>
              </Section>
            )}

            <Section title="Date facturare (Stripe)">
              {stripeLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : !stripeDetails ? (
                <p className="text-xs text-muted-foreground">
                  Detaliile nu sunt disponibile (plată fără Stripe Session sau eroare API).
                </p>
              ) : (
                <>
                  <Kv k="Nume" v={stripeDetails.name ?? '—'} />
                  <Kv k="Email" v={stripeDetails.email ?? '—'} />
                  <Kv k="Telefon" v={stripeDetails.phone ?? '—'} />
                  {stripeDetails.address ? (
                    <>
                      <Kv k="Adresă" v={stripeDetails.address.line1 ?? '—'} />
                      {stripeDetails.address.line2 && (
                        <Kv k="Adresă (2)" v={stripeDetails.address.line2} />
                      )}
                      <Kv
                        k="Oraș"
                        v={`${stripeDetails.address.city ?? '—'}${
                          stripeDetails.address.state ? `, ${stripeDetails.address.state}` : ''
                        }`}
                      />
                      <Kv k="Cod poștal" v={stripeDetails.address.postalCode ?? '—'} />
                      <Kv k="Țară" v={stripeDetails.address.country ?? '—'} />
                    </>
                  ) : (
                    <Kv k="Adresă" v="—" />
                  )}
                  {stripeDetails.paymentMethod && (
                    <Kv
                      k="Card"
                      v={
                        stripeDetails.paymentMethod.brand
                          ? `${stripeDetails.paymentMethod.brand.toUpperCase()} ••••${stripeDetails.paymentMethod.last4 ?? '????'} (${stripeDetails.paymentMethod.expMonth}/${stripeDetails.paymentMethod.expYear})`
                          : '—'
                      }
                    />
                  )}
                </>
              )}
            </Section>

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
