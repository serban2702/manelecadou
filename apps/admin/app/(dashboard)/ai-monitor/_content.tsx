'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { Bot, ChevronDown, ChevronRight, ExternalLink, Loader2, RefreshCw, Terminal } from 'lucide-react';
import { AiChatApi, type AiToolCallAudit, type CostSummaryRow } from '@/lib/api';
import { useAsync } from '@/lib/hooks/use-async';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { SpaLink } from '@/lib/spa-router';
import { cn } from '@/lib/cn';

const MODE_COLOR: Record<string, string> = {
  manual: 'bg-muted text-muted-foreground',
  suggest: 'bg-amber-500/15 text-amber-400',
  auto: 'bg-emerald-500/15 text-emerald-500',
};

const TOOL_COLOR: Record<string, string> = {
  send_message: 'bg-blue-500/15 text-blue-400',
  search_memory: 'bg-purple-500/15 text-purple-400',
  wizard_get_state: 'bg-cyan-500/15 text-cyan-400',
  wizard_update: 'bg-cyan-500/15 text-cyan-400',
  wizard_finalize: 'bg-emerald-500/15 text-emerald-400',
  send_payment_link: 'bg-yellow-500/15 text-yellow-400',
  force_open_chat: 'bg-pink-500/15 text-pink-400',
  escalate_to_human: 'bg-red-500/15 text-red-400',
};

export default function AiMonitorPage() {
  const [conversationIdFilter, setConversationIdFilter] = useState('');
  const [toolNameFilter, setToolNameFilter] = useState('');
  const [limit, setLimit] = useState(100);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data: rows, refetch, loading } = useAsync<AiToolCallAudit[]>(
    () =>
      AiChatApi.auditList({
        conversationId: conversationIdFilter.trim() || undefined,
        toolName: toolNameFilter.trim() || undefined,
        limit,
      }),
    [conversationIdFilter, toolNameFilter, limit],
    { refetchInterval: autoRefresh ? 5_000 : undefined },
  );

  const { data: cost } = useAsync<CostSummaryRow[]>(
    () => AiChatApi.costSummary(),
    [rows?.length ?? 0],
  );

  /** Grupez tool calls în „runs" — apeluri din aceeași conv în <30s consecutive. */
  const groupedRuns = useMemo(() => {
    if (!rows) return [];
    const groups: { id: string; conversationId: string; startedAt: string; calls: AiToolCallAudit[] }[] = [];
    const sorted = [...rows].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    for (const c of sorted) {
      const last = groups[groups.length - 1];
      if (
        last &&
        last.conversationId === c.conversationId &&
        new Date(c.createdAt).getTime() - new Date(last.calls[last.calls.length - 1].createdAt).getTime() < 30_000
      ) {
        last.calls.push(c);
      } else {
        groups.push({ id: c.id, conversationId: c.conversationId, startedAt: c.createdAt, calls: [c] });
      }
    }
    return groups.reverse(); // cele mai noi primele
  }, [rows]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalCalls = rows?.length ?? 0;
  const totalTokensIn = cost?.reduce((s, c) => s + (c.tokensIn ?? 0), 0) ?? 0;
  const totalTokensOut = cost?.reduce((s, c) => s + (c.tokensOut ?? 0), 0) ?? 0;
  // Estimare cost approximativ: gpt-4o-mini = $0.15/1M in + $0.60/1M out
  const approxCost7d =
    cost?.reduce((s, c) => {
      const isMini = (c.model ?? '').includes('mini');
      const inRate = isMini ? 0.15 : 2.5;
      const outRate = isMini ? 0.60 : 10;
      return s + (c.tokensIn / 1_000_000) * inRate + (c.tokensOut / 1_000_000) * outRate;
    }, 0) ?? 0;

  return (
    <div>
      <PageHeader
        title="AI Monitor"
        description="Audit complet: fiecare apel AI (tool call) loggat cu input/output/model/tokens. Polling 5s."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh((v) => !v)}
              className={autoRefresh ? 'border-emerald-500/40 text-emerald-500' : ''}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', autoRefresh && loading && 'animate-spin')} />
              {autoRefresh ? 'Live (5s)' : 'Pause'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Tool calls afișate" value={totalCalls.toString()} icon={<Terminal className="h-4 w-4" />} />
        <StatCard label="Runs grupate" value={groupedRuns.length.toString()} icon={<Bot className="h-4 w-4" />} />
        <StatCard label="Tokens (7d)" value={`${(totalTokensIn / 1000).toFixed(1)}k in · ${(totalTokensOut / 1000).toFixed(1)}k out`} icon={<Terminal className="h-4 w-4" />} />
        <StatCard label="Cost estimat (7d)" value={`$${approxCost7d.toFixed(3)}`} icon={<Terminal className="h-4 w-4" />} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          type="text"
          value={conversationIdFilter}
          onChange={(e) => setConversationIdFilter(e.target.value)}
          placeholder="Filtrează după conversationId (UUID)"
          className="h-8 px-3 text-xs rounded-md bg-secondary/40 border border-border focus:outline-none w-72 font-mono"
        />
        <select
          value={toolNameFilter}
          onChange={(e) => setToolNameFilter(e.target.value)}
          className="h-8 px-3 text-xs rounded-md bg-secondary/40 border border-border focus:outline-none"
        >
          <option value="">Toate tool-urile</option>
          <option value="send_message">send_message</option>
          <option value="search_memory">search_memory</option>
          <option value="wizard_get_state">wizard_get_state</option>
          <option value="wizard_update">wizard_update</option>
          <option value="wizard_finalize">wizard_finalize</option>
          <option value="send_payment_link">send_payment_link</option>
          <option value="force_open_chat">force_open_chat</option>
          <option value="escalate_to_human">escalate_to_human</option>
        </select>
        <select
          value={limit}
          onChange={(e) => setLimit(parseInt(e.target.value, 10))}
          className="h-8 px-3 text-xs rounded-md bg-secondary/40 border border-border focus:outline-none"
        >
          <option value="50">Ultimele 50</option>
          <option value="100">Ultimele 100</option>
          <option value="250">Ultimele 250</option>
          <option value="500">Ultimele 500</option>
        </select>
      </div>

      {/* Cost breakdown */}
      {cost && cost.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-card border border-border">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Cost pe model — ultimele 7 zile
          </div>
          <div className="flex flex-wrap gap-3">
            {cost.map((c) => (
              <div key={c.model ?? 'unknown'} className="text-xs">
                <span className="font-mono text-foreground">{c.model ?? 'unknown'}</span>{' '}
                <span className="text-muted-foreground">
                  · {c.calls} apeluri · {(c.tokensIn / 1000).toFixed(1)}k in / {(c.tokensOut / 1000).toFixed(1)}k out
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Runs grouped */}
      {!rows ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : groupedRuns.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Nici un apel AI logat pentru filtrele curente.
        </div>
      ) : (
        <div className="space-y-2">
          {groupedRuns.map((run) => (
            <div key={run.id} className="rounded-lg border border-border bg-card">
              <div className="px-3 py-2 border-b border-border flex items-center gap-2 flex-wrap">
                <Bot className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-mono text-muted-foreground">
                  {format(new Date(run.startedAt), 'dd MMM HH:mm:ss', { locale: ro })}
                </span>
                <Badge
                  variant="muted"
                  className={cn('text-[10px] px-1.5', MODE_COLOR[run.calls[0].aiMode] ?? '')}
                >
                  {run.calls[0].aiMode}
                </Badge>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs">
                  <strong>{run.calls.length}</strong> tool call{run.calls.length !== 1 ? 's' : ''}
                </span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  conv: {run.conversationId.slice(0, 8)}
                </span>
                <SpaLink
                  href={`/chat?c=${run.conversationId}`}
                  className="ml-auto text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  Deschide chat <ExternalLink className="h-3 w-3" />
                </SpaLink>
              </div>
              <div className="divide-y divide-border">
                {run.calls.map((call) => (
                  <ToolCallRow
                    key={call.id}
                    call={call}
                    expanded={expanded.has(call.id)}
                    onToggle={() => toggleExpanded(call.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="p-3 rounded-lg bg-card border border-border">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
        {icon}
        {label}
      </div>
      <div className="text-base font-bold">{value}</div>
    </div>
  );
}

function ToolCallRow({
  call,
  expanded,
  onToggle,
}: {
  call: AiToolCallAudit;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isError = !!call.error;
  return (
    <div className={cn('px-3 py-2 transition-colors', isError && 'bg-destructive/5')}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left flex items-center gap-2 flex-wrap"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <Badge variant="muted" className={cn('text-[10px] px-1.5 font-mono', TOOL_COLOR[call.toolName] ?? 'bg-secondary')}>
          {call.toolName}
        </Badge>
        {isError && (
          <Badge variant="destructive" className="text-[10px] px-1.5">
            error
          </Badge>
        )}
        {call.requiredApproval && (
          <Badge variant="muted" className="text-[10px] px-1.5 bg-yellow-500/15 text-yellow-500">
            approval req.
          </Badge>
        )}
        {!isError && call.toolName === 'send_message' && (
          <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
            {typeof call.input?.text === 'string' ? `"${(call.input.text as string).slice(0, 80)}${(call.input.text as string).length > 80 ? '…' : ''}"` : ''}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto font-mono">
          {format(new Date(call.createdAt), 'HH:mm:ss', { locale: ro })}
          {call.model && ` · ${call.model}`}
          {call.totalPromptTokens !== null && ` · ${call.totalPromptTokens + (call.totalCompletionTokens ?? 0)}t`}
        </span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-2 pl-5">
          <JsonBlock label="Input" data={call.input} />
          {isError ? (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-destructive font-semibold mb-1">Error</div>
              <pre className="text-xs bg-destructive/10 border border-destructive/30 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">{call.error}</pre>
            </div>
          ) : (
            <JsonBlock label="Output" data={call.output} />
          )}
          <div className="text-[10px] text-muted-foreground font-mono">
            id: {call.id} · trigger: {call.triggerMessageId ?? '—'}
          </div>
        </div>
      )}
    </div>
  );
}

function JsonBlock({ label, data }: { label: string; data: unknown }) {
  const text = data === null || data === undefined ? '(null)' : JSON.stringify(data, null, 2);
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{label}</div>
      <pre className="text-xs bg-secondary/40 border border-border rounded p-2 overflow-x-auto whitespace-pre-wrap break-words font-mono">{text}</pre>
    </div>
  );
}
