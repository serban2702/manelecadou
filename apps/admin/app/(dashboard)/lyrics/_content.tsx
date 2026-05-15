'use client';

import { useMemo, useState } from 'react';
import { useAsync } from '@/lib/hooks/use-async';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { LyricsApi } from '@/lib/api/lyrics.api';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const OUTCOME_VARIANT: Record<string, BadgeProps['variant']> = {
  success: 'success',
  failed: 'destructive',
  mock_fallback: 'warning',
  pending: 'warning',
};

const STAGE_LABEL: Record<string, string> = {
  writer: 'writer (draft)',
  critic: 'critic (rafinare)',
};

export default function LyricsPage() {
  const [outcomeFilter, setOutcomeFilter] = useState<string>('');
  const [stageFilter, setStageFilter] = useState<string>('');
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: summary, loading: loadingSummary } = useAsync(
    () => LyricsApi.summary(),
    [],
    { refetchInterval: 15_000 },
  );
  const { data: logs, loading: loadingLogs } = useAsync(
    () =>
      LyricsApi.logs({
        limit: 100,
        outcome: outcomeFilter || undefined,
        stage: stageFilter || undefined,
      }),
    [outcomeFilter, stageFilter],
    { refetchInterval: 10_000 },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lyrics (OpenAI)"
        description="Apeluri către OpenAI pentru writer + critic. Toate request-urile și răspunsurile sunt persistate pentru audit și debug."
      />

      {/* === SUMAR === */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiCard
          loading={loadingSummary}
          label="Total apeluri"
          value={summary ? String(summary.total) : '—'}
          hint={
            summary
              ? `writer: ${summary.stageCounts.writer ?? 0} · critic: ${summary.stageCounts.critic ?? 0}`
              : undefined
          }
        />
        <KpiCard
          loading={loadingSummary}
          label="Tokens total"
          value={summary ? summary.totalTokens.toLocaleString('ro-RO') : '—'}
          hint={
            summary
              ? `prompt ${summary.totalTokensPrompt.toLocaleString('ro-RO')} · completion ${summary.totalTokensCompletion.toLocaleString('ro-RO')}`
              : undefined
          }
        />
        <KpiCard
          loading={loadingSummary}
          label="Apeluri 24h"
          value={summary ? String(summary.last24h.count) : '—'}
          hint={
            summary
              ? `${summary.last24h.tokens.toLocaleString('ro-RO')} tokens`
              : undefined
          }
        />
        <KpiCard
          loading={loadingSummary}
          label="Eșecuri"
          value={
            summary
              ? String(
                  (summary.outcomeCounts.failed ?? 0) +
                    (summary.outcomeCounts.mock_fallback ?? 0),
                )
              : '—'
          }
          hint={
            summary
              ? `failed ${summary.outcomeCounts.failed ?? 0} · mock ${summary.outcomeCounts.mock_fallback ?? 0}`
              : undefined
          }
          tone={
            summary &&
            ((summary.outcomeCounts.failed ?? 0) +
              (summary.outcomeCounts.mock_fallback ?? 0)) >
              0
              ? 'warn'
              : 'ok'
          }
        />
      </div>

      {/* === LOG-URI === */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h2 className="text-sm font-semibold">Apeluri OpenAI (system + user / response)</h2>
            <div className="flex gap-2 flex-wrap">
              {(['', 'success', 'failed', 'mock_fallback', 'pending'] as const).map((o) => (
                <button
                  key={o || 'all-outcome'}
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
              <span className="mx-1 text-muted-foreground">|</span>
              {(['', 'writer', 'critic'] as const).map((s) => (
                <button
                  key={s || 'all-stage'}
                  onClick={() => setStageFilter(s)}
                  className={`text-xs px-2 py-1 rounded border ${
                    stageFilter === s
                      ? 'bg-primary/15 text-primary border-primary/30'
                      : 'border-border text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  {s || 'toate stage-urile'}
                </button>
              ))}
            </div>
          </div>
          {loadingLogs ? (
            <Skeleton className="h-72 w-full" />
          ) : (logs ?? []).length === 0 ? (
            <Empty title="Niciun log lyrics deocamdată" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timp</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Locale</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Durată</TableHead>
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
                    <TableCell className="text-xs">
                      {STAGE_LABEL[l.stage] ?? l.stage}
                    </TableCell>
                    <TableCell>
                      <Badge variant={OUTCOME_VARIANT[l.outcome] ?? 'muted'}>{l.outcome}</Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{l.model ?? '—'}</TableCell>
                    <TableCell className="text-xs">{l.locale ?? '—'}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs">
                      {l.tokensTotal != null ? l.tokensTotal.toLocaleString('ro-RO') : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs">
                      {l.durationMs != null ? `${l.durationMs} ms` : '—'}
                    </TableCell>
                    <TableCell
                      className="text-xs text-destructive max-w-md truncate"
                      title={l.errorMessage ?? ''}
                    >
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

      <LyricsLogDetailDialog id={detailId} onClose={() => setDetailId(null)} />
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

function LyricsLogDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, loading: isLoading } = useAsync(
    () => (id ? LyricsApi.logDetail(id) : Promise.resolve(null as never)),
    [id],
    { enabled: !!id },
  );

  const formattedResponse = useMemo(() => {
    if (!data) return null;
    try {
      return JSON.stringify(data.responseBody, null, 2);
    } catch {
      return String(data.responseBody ?? '');
    }
  }, [data]);

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Apel OpenAI lyrics</DialogTitle>
          <DialogDescription>
            {data ? `${STAGE_LABEL[data.stage] ?? data.stage} · ${data.model ?? '—'}` : ''}
          </DialogDescription>
        </DialogHeader>
        {isLoading || !data ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-muted-foreground">Outcome</div>
                <div className="font-medium">{data.outcome}</div>
              </div>
              <div>
                <div className="text-muted-foreground">HTTP status</div>
                <div className="font-mono">{data.responseStatus ?? '—'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Tokens (prompt / completion / total)</div>
                <div className="font-mono">
                  {data.tokensPrompt ?? '—'} / {data.tokensCompletion ?? '—'} /{' '}
                  {data.tokensTotal ?? '—'}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Durată</div>
                <div className="font-mono">
                  {data.durationMs != null ? `${data.durationMs} ms` : '—'}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Locale</div>
                <div className="font-mono">{data.locale ?? '—'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Generation ID</div>
                <div className="font-mono break-all">{data.generationId ?? '—'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Site ID</div>
                <div className="font-mono break-all">{data.siteId ?? '—'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Creat</div>
                <div className="font-mono">
                  {format(new Date(data.createdAt), 'd MMM yyyy HH:mm:ss', { locale: ro })}
                </div>
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
              <div className="text-muted-foreground mb-1">System prompt</div>
              <pre className="bg-secondary/50 border border-border rounded p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-72 overflow-y-auto">
                {data.systemPrompt}
              </pre>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">User prompt</div>
              <pre className="bg-secondary/50 border border-border rounded p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-72 overflow-y-auto">
                {data.userPrompt}
              </pre>
            </div>
            {data.responseContent && (
              <div>
                <div className="text-muted-foreground mb-1">Response content (text)</div>
                <pre className="bg-emerald-500/10 border border-emerald-500/30 rounded p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
                  {data.responseContent}
                </pre>
              </div>
            )}
            {formattedResponse && formattedResponse !== 'null' && (
              <div>
                <div className="text-muted-foreground mb-1">Response body (raw)</div>
                <pre className="bg-secondary/50 border border-border rounded p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
                  {formattedResponse}
                </pre>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
