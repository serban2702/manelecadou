'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { Mail, CheckCircle2, AlertCircle, Clock, Search, RefreshCw } from 'lucide-react';
import { OutboundEmailApi } from '@/lib/api/outbound-email.api';
import { useAsync } from '@/lib/hooks/use-async';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SiteBadge } from '@/components/site-badge';
import type { AdminOutboundEmail } from '@/lib/types';

/** Root URL OpenReplay self-hosted — același folosit în pagina /errors. */
const OPENREPLAY_DASHBOARD =
  process.env.NEXT_PUBLIC_OPENREPLAY_DASHBOARD_URL ?? 'https://openreplay.manelecadou.ro';

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  sent: 'success',
  queued: 'warning',
  failed: 'destructive',
};

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  sent: CheckCircle2,
  queued: Clock,
  failed: AlertCircle,
};

/** Categoriile cunoscute pe care le seedăm în filtru. Lista e doar pentru UX —
 *  filtrul acceptă orice string care apare în DB. */
const KNOWN_KINDS: { value: string; label: string }[] = [
  { value: 'magic_link', label: 'Magic link (login)' },
  { value: 'gift_code', label: 'Cod cadou' },
  { value: 'generation_ready', label: 'Generare gata' },
  { value: 'payment_success', label: 'Plată confirmată' },
  { value: 'gdpr_admin_notify', label: 'GDPR (admin)' },
  { value: 'admin_test', label: 'Test admin' },
];

export default function AdminEmailsPage() {
  const [status, setStatus] = useState<string>('all');
  const [kind, setKind] = useState<string>('all');
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [selected, setSelected] = useState<AdminOutboundEmail | null>(null);

  const { data: stats } = useAsync(() => OutboundEmailApi.stats(), [], {
    refetchInterval: 15_000,
  });

  const { data, loading, refetch } = useAsync(
    () =>
      OutboundEmailApi.list({
        status: status !== 'all' ? (status as 'queued' | 'sent' | 'failed') : undefined,
        kind: kind !== 'all' ? kind : undefined,
        q: q || undefined,
        limit: 200,
      }),
    [status, kind, q],
    { refetchInterval: 10_000 },
  );

  const items = data?.items ?? [];

  const kindOptions = useMemo(() => {
    // Combinăm categoriile cunoscute cu cele care apar efectiv în rezultate,
    // pentru cazurile când codul a introdus o nouă categorie.
    const seen = new Set<string>(KNOWN_KINDS.map((k) => k.value));
    const extras: { value: string; label: string }[] = [];
    items.forEach((it) => {
      if (it.kind && !seen.has(it.kind)) {
        seen.add(it.kind);
        extras.push({ value: it.kind, label: it.kind });
      }
    });
    return [...KNOWN_KINDS, ...extras];
  }, [items]);

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setQ(qInput.trim());
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Emails trimise"
        description="Audit complet al fiecărui mail transactional trimis din platformă. Verifică status, preview și debug provider."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Trimise (24h)"
          value={stats?.last24h.sent ?? 0}
          icon={CheckCircle2}
          tone="success"
        />
        <KpiCard
          label="Queued"
          value={stats?.queued ?? 0}
          icon={Clock}
          tone={(stats?.queued ?? 0) > 0 ? 'warning' : 'muted'}
        />
        <KpiCard
          label="Eșecuri (total)"
          value={stats?.failed ?? 0}
          icon={AlertCircle}
          tone={(stats?.failed ?? 0) > 0 ? 'destructive' : 'muted'}
        />
        <KpiCard
          label="Eșecuri (24h)"
          value={stats?.last24h.failed ?? 0}
          icon={AlertCircle}
          tone={(stats?.last24h.failed ?? 0) > 0 ? 'destructive' : 'muted'}
        />
      </div>

      {/* Filtre */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toate</SelectItem>
                  <SelectItem value="sent">Trimise</SelectItem>
                  <SelectItem value="queued">Queued</SelectItem>
                  <SelectItem value="failed">Eșuate</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Categorie</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger className="w-[200px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toate categoriile</SelectItem>
                  {kindOptions.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <form onSubmit={applySearch} className="space-y-1.5 flex-1 min-w-[240px]">
              <Label className="text-xs">Caută (destinatar, subject, eroare)</Label>
              <div className="flex gap-2">
                <Input
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="ex. john@example.com"
                  className="h-9"
                />
                <Button type="submit" size="sm" variant="secondary">
                  <Search className="h-3.5 w-3.5" />
                </Button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      <Card>
        <CardContent className="p-0">
          {loading && !data ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <Empty
              icon={<Mail className="h-5 w-5" />}
              title="Niciun mail în această căutare"
              description="Modifică filtrele sau așteaptă trimiterea unui mail nou."
            />
          ) : (
            <div className="divide-y">
              {items.map((it) => (
                <EmailRow key={it.id} item={it} onClick={() => setSelected(it)} />
              ))}
              {data && data.total > items.length && (
                <div className="p-3 text-center text-xs text-muted-foreground">
                  Afișate primele {items.length} din {data.total}. Restrânge filtrele pentru rezultate mai precise.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <EmailDetailDialog
        emailId={selected?.id ?? null}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function EmailRow({
  item,
  onClick,
}: {
  item: AdminOutboundEmail;
  onClick: () => void;
}) {
  const Icon = STATUS_ICON[item.status] ?? Mail;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left p-3 hover:bg-muted/40 transition flex items-start gap-3"
    >
      <Icon
        className={
          item.status === 'sent'
            ? 'h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0'
            : item.status === 'failed'
            ? 'h-4 w-4 text-red-500 mt-0.5 flex-shrink-0'
            : 'h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0'
        }
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{item.subject || '(fără subiect)'}</span>
          <Badge variant={STATUS_VARIANT[item.status] ?? 'secondary'} className="text-[10px]">
            {item.status}
          </Badge>
          {item.kind && (
            <Badge variant="secondary" className="text-[10px]">
              {item.kind}
            </Badge>
          )}
          <SiteBadge siteId={item.siteId} />
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
          <span className="truncate">→ {item.to}</span>
          <span>·</span>
          <span>
            {format(new Date(item.createdAt), 'd MMM yyyy, HH:mm:ss', { locale: ro })}
          </span>
          {item.provider && (
            <>
              <span>·</span>
              <span>via {item.provider}</span>
            </>
          )}
        </div>
        {item.status === 'failed' && item.errorMessage && (
          <div className="text-xs text-red-500 mt-1 line-clamp-2">{item.errorMessage}</div>
        )}
      </div>
    </button>
  );
}

function EmailDetailDialog({
  emailId,
  onClose,
}: {
  emailId: string | null;
  onClose: () => void;
}) {
  const { data: full, loading } = useAsync(
    () => (emailId ? OutboundEmailApi.get(emailId) : Promise.resolve(null)),
    [emailId],
  );

  return (
    <Dialog open={!!emailId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {full?.subject || (loading ? 'Se încarcă…' : 'Email')}
          </DialogTitle>
        </DialogHeader>
        {loading || !full ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <MetaField label="Status">
                <Badge variant={STATUS_VARIANT[full.status] ?? 'secondary'} className="text-[10px]">
                  {full.status}
                </Badge>
              </MetaField>
              <MetaField label="Categorie">{full.kind ?? '—'}</MetaField>
              <MetaField label="Către">{full.to}</MetaField>
              <MetaField label="De la">{full.fromAddress ?? '—'}</MetaField>
              {full.replyTo && <MetaField label="Reply-To">{full.replyTo}</MetaField>}
              <MetaField label="Provider">{full.provider ?? '—'}</MetaField>
              <MetaField label="Message-Id">
                <code className="text-[11px] break-all">{full.providerMessageId ?? '—'}</code>
              </MetaField>
              <MetaField label="Creat">
                {format(new Date(full.createdAt), 'd MMM yyyy, HH:mm:ss', { locale: ro })}
              </MetaField>
              {full.finalizedAt && (
                <MetaField label="Finalizat">
                  {format(new Date(full.finalizedAt), 'd MMM yyyy, HH:mm:ss', { locale: ro })}
                </MetaField>
              )}
              {full.relatedId && <MetaField label="Related ID"><code>{full.relatedId}</code></MetaField>}
              {full.userId && <MetaField label="User ID"><code>{full.userId}</code></MetaField>}
              {full.openReplaySessionId && (
                <MetaField label="OpenReplay">
                  <a
                    href={`${OPENREPLAY_DASHBOARD}/sessions/${full.openReplaySessionId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline text-[11px]"
                  >
                    ▶ Watch replay
                  </a>
                </MetaField>
              )}
            </div>

            {full.status === 'failed' && full.errorMessage && (
              <div className="rounded border border-red-500/30 bg-red-500/5 p-3">
                <div className="text-xs font-medium text-red-500 mb-1">Eroare provider</div>
                <pre className="text-[11px] whitespace-pre-wrap text-red-200/90">{full.errorMessage}</pre>
              </div>
            )}

            {full.providerNotes && (
              <div className="rounded border border-amber-500/20 bg-amber-500/5 p-2.5 text-xs text-amber-200/90">
                {full.providerNotes}
              </div>
            )}

            {full.html ? (
              <div>
                <div className="text-xs font-medium mb-2 text-muted-foreground">Preview HTML</div>
                <iframe
                  title="email preview"
                  srcDoc={full.html}
                  className="w-full h-[480px] rounded border bg-white"
                  sandbox=""
                />
              </div>
            ) : full.text ? (
              <div>
                <div className="text-xs font-medium mb-2 text-muted-foreground">Conținut text</div>
                <pre className="text-xs whitespace-pre-wrap rounded border p-3 bg-muted/30">{full.text}</pre>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xs">{children}</div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof CheckCircle2;
  tone: 'success' | 'warning' | 'destructive' | 'muted';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-emerald-500'
      : tone === 'warning'
      ? 'text-amber-500'
      : tone === 'destructive'
      ? 'text-red-500'
      : 'text-muted-foreground';
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className={`h-4 w-4 ${toneClass}`} />
        </div>
        <div className={`text-2xl font-semibold mt-1 ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
