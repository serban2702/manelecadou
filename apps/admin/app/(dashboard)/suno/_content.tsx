'use client';

import { useMemo, useState } from 'react';
import { useAsync } from "@/lib/hooks/use-async";
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { Coins, Plus, Trash2 } from 'lucide-react';
import { SunoApi } from '@/lib/api';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Empty } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/use-toast';

const OUTCOME_VARIANT: Record<string, BadgeProps['variant']> = {
  success: 'success',
  failed: 'destructive',
  http_error: 'destructive',
  timeout: 'destructive',
  pending: 'warning',
};

export default function SunoPage() {
  const { toast } = useToast();
  const [outcomeFilter, setOutcomeFilter] = useState<string>('');
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: summary, loading: loadingSummary, refetch: refetchSummary } = useAsync(
    () => SunoApi.summary(),
    [],
    { refetchInterval: 15_000 },
  );
  const { data: logs, loading: loadingLogs } = useAsync(
    () => SunoApi.logs({ limit: 100, outcome: outcomeFilter || undefined }),
    [outcomeFilter],
    { refetchInterval: 10_000 },
  );
  const { data: purchases, loading: loadingPurchases, refetch: refetchPurchases } = useAsync(
    () => SunoApi.purchases(),
    [],
  );

  // Form state pentru "adaugă cumpărare credite"
  const [credits, setCredits] = useState('');
  const [amountRon, setAmountRon] = useState('');
  const [amountUsd, setAmountUsd] = useState('');
  const [purchasedAt, setPurchasedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submitPurchase(e: React.FormEvent) {
    e.preventDefault();
    const c = Number(credits);
    const r = Number(amountRon);
    if (!Number.isFinite(c) || c <= 0) {
      toast({ variant: 'destructive', title: 'Credite invalide' });
      return;
    }
    if (!Number.isFinite(r) || r < 0) {
      toast({ variant: 'destructive', title: 'Sumă RON invalidă' });
      return;
    }
    setSubmitting(true);
    try {
      await SunoApi.purchaseCreate({
        credits: c,
        amountRon: r,
        amountUsd: amountUsd ? Number(amountUsd) : undefined,
        purchasedAt: purchasedAt || undefined,
        notes: notes || undefined,
      });
      toast({ title: 'Achiziție adăugată' });
      setCredits('');
      setAmountRon('');
      setAmountUsd('');
      setNotes('');
      refetchPurchases();
      refetchSummary();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Eroare la salvare',
        description: (err as Error).message,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function deletePurchase(id: string) {
    const ok = await confirmDialog({
      title: 'Ștergi achiziția?',
      description: 'Soldul de credite va fi recalculat.',
      confirmText: 'Șterge',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await SunoApi.purchaseDelete(id);
      refetchPurchases();
      refetchSummary();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Nu s-a putut șterge', description: (err as Error).message });
    }
  }

  const balanceLow = (summary?.balance.credits ?? 0) < (summary?.defaultCostPerGenerate ?? 0) * 5;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suno credits"
        description="Cheltuieli, sold și log-uri brute (request/response) către sunoapi.org."
      />

      {/* === SUMAR / SOLD === */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiCard
          loading={loadingSummary}
          label="Sold credite"
          value={summary ? summary.balance.credits.toFixed(2) : '—'}
          hint={
            summary
              ? `≈ ${Math.floor(summary.balance.credits / Math.max(summary.defaultCostPerGenerate, 1))} generări rămase`
              : undefined
          }
          tone={balanceLow ? 'warn' : 'ok'}
        />
        <KpiCard
          loading={loadingSummary}
          label="Cumpărate (total)"
          value={summary ? summary.purchased.credits.toFixed(2) : '—'}
          hint={summary ? `${summary.purchased.amountRon.toFixed(2)} RON` : undefined}
        />
        <KpiCard
          loading={loadingSummary}
          label="Folosite (total)"
          value={summary ? summary.used.credits.toFixed(2) : '—'}
          hint={summary ? `≈ ${summary.used.ronEstimate.toFixed(2)} RON cost` : undefined}
        />
        <KpiCard
          loading={loadingSummary}
          label="Folosite (24h)"
          value={summary ? summary.used.last24hCredits.toFixed(2) : '—'}
          hint={
            summary
              ? `${summary.outcomeCounts.success ?? 0} ok / ${
                  (summary.outcomeCounts.failed ?? 0) +
                  (summary.outcomeCounts.http_error ?? 0) +
                  (summary.outcomeCounts.timeout ?? 0)
                } eșecuri`
              : undefined
          }
        />
      </div>

      {/* === ADAUGĂ CUMPĂRARE === */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Coins className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Înregistrează o cumpărare de credite</h2>
          </div>
          <form onSubmit={submitPurchase} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div>
              <Label htmlFor="credits">Credite</Label>
              <Input
                id="credits"
                type="number"
                step="0.01"
                min="0"
                placeholder="ex: 1000"
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="amountRon">Plătit (RON)</Label>
              <Input
                id="amountRon"
                type="number"
                step="0.01"
                min="0"
                placeholder="ex: 92.50"
                value={amountRon}
                onChange={(e) => setAmountRon(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="amountUsd">Plătit (USD, opt.)</Label>
              <Input
                id="amountUsd"
                type="number"
                step="0.01"
                min="0"
                placeholder="ex: 20"
                value={amountUsd}
                onChange={(e) => setAmountUsd(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="purchasedAt">Data</Label>
              <Input
                id="purchasedAt"
                type="date"
                value={purchasedAt}
                onChange={(e) => setPurchasedAt(e.target.value)}
              />
            </div>
            <div>
              <Button type="submit" disabled={submitting} className="w-full">
                <Plus className="h-4 w-4" />
                {submitting ? 'Salvez...' : 'Adaugă'}
              </Button>
            </div>
            <div className="md:col-span-5">
              <Label htmlFor="notes">Note (opțional)</Label>
              <Textarea
                id="notes"
                rows={2}
                placeholder="ex: pachet 1000 credite, 20$ via card, factura #123"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </form>
        </CardContent>
      </Card>

      {/* === ACHIZIȚII === */}
      <Card>
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold mb-3">Istoric achiziții</h2>
          {loadingPurchases ? (
            <Skeleton className="h-32 w-full" />
          ) : (purchases ?? []).length === 0 ? (
            <Empty icon={<Coins className="h-5 w-5" />} title="Nicio achiziție înregistrată" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Credite</TableHead>
                  <TableHead className="text-right">RON</TableHead>
                  <TableHead className="text-right">USD</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Înregistrat de</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases!.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(p.purchasedAt), 'd MMM yyyy', { locale: ro })}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{p.credits.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{p.amountRon.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                      {p.amountUsd != null ? p.amountUsd.toFixed(2) : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                      {p.notes ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.recordedByEmail ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => deletePurchase(p.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* === LOG-URI === */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h2 className="text-sm font-semibold">Apeluri Suno (request / response)</h2>
            <div className="flex gap-2">
              {(['', 'success', 'failed', 'http_error', 'timeout', 'pending'] as const).map((o) => (
                <button
                  key={o || 'all'}
                  onClick={() => setOutcomeFilter(o)}
                  className={`text-xs px-2 py-1 rounded border ${
                    outcomeFilter === o
                      ? 'bg-primary/15 text-primary border-primary/30'
                      : 'border-border text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  {o || 'toate'}
                </button>
              ))}
            </div>
          </div>
          {loadingLogs ? (
            <Skeleton className="h-72 w-full" />
          ) : (logs ?? []).length === 0 ? (
            <Empty title="Niciun log Suno deocamdată" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timp</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Provider status</TableHead>
                  <TableHead className="text-right">Credite</TableHead>
                  <TableHead>Eroare</TableHead>
                  <TableHead>Generation</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs!.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(l.createdAt), "d MMM 'la' HH:mm:ss", { locale: ro })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={OUTCOME_VARIANT[l.outcome] ?? 'muted'}>{l.outcome}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.responseStatus ?? '—'}</TableCell>
                    <TableCell className="text-xs">{l.providerStatus ?? '—'}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs">
                      {l.costCredits.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs text-destructive max-w-md truncate" title={l.errorMessage ?? ''}>
                      {l.errorMessage ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {l.generationId ? (
                        <code className="text-muted-foreground">{l.generationId.slice(0, 8)}</code>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => setDetailId(l.id)}>
                        Detalii
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SunoLogDetailDialog id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  loading,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  loading?: boolean;
  tone?: 'ok' | 'warn';
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        {loading ? (
          <Skeleton className="h-7 w-24 mt-1" />
        ) : (
          <div
            className={`text-2xl font-semibold tabular-nums ${
              tone === 'warn' ? 'text-destructive' : ''
            }`}
          >
            {value}
          </div>
        )}
        {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function SunoLogDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, loading: isLoading } = useAsync(
    () => id ? SunoApi.logDetail(id) : Promise.resolve(null as never),
    [id],
    { enabled: !!id },
  );

  const formatted = useMemo(() => {
    if (!data) return null;
    return {
      request: JSON.stringify(data.requestBody, null, 2),
      response: JSON.stringify(data.responseBody, null, 2),
    };
  }, [data]);

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Apel Suno</DialogTitle>
          <DialogDescription>{data?.endpoint}</DialogDescription>
        </DialogHeader>
        {isLoading || !data || !formatted ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-muted-foreground">Outcome</div>
                <div className="font-medium">{data.outcome}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Provider status</div>
                <div className="font-medium">{data.providerStatus ?? '—'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">HTTP status</div>
                <div className="font-mono">{data.responseStatus ?? '—'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Cost (credite)</div>
                <div className="font-mono">{data.costCredits.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Task ID</div>
                <div className="font-mono break-all">{data.taskId ?? '—'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Generation ID</div>
                <div className="font-mono break-all">{data.generationId ?? '—'}</div>
              </div>
            </div>
            {data.errorMessage && (
              <div>
                <div className="text-muted-foreground mb-1">Error message</div>
                <pre className="bg-destructive/10 border border-destructive/30 rounded p-3 text-destructive whitespace-pre-wrap break-words">
                  {data.errorMessage}
                </pre>
              </div>
            )}
            <div>
              <div className="text-muted-foreground mb-1">Request body</div>
              <pre className="bg-secondary/50 border border-border rounded p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-72 overflow-y-auto">
                {formatted.request}
              </pre>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Response body</div>
              <pre className="bg-secondary/50 border border-border rounded p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
                {formatted.response}
              </pre>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
