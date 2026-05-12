'use client';

import { useState } from 'react';
import { useAsync } from "@/lib/hooks/use-async";
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import {
  AlertTriangle,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Info,
  Trash2,
  XCircle,
} from 'lucide-react';
import { ErrorsApi } from '@/lib/api';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Empty } from '@/components/ui/empty';
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
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/cn';
import { SiteBadge } from '@/components/site-badge';

const LEVEL_VARIANT: Record<string, BadgeProps['variant']> = {
  error: 'destructive',
  warn: 'warning',
  info: 'info',
};

export default function AdminErrorsPage() {
  const { toast } = useToast();
  const [level, setLevel] = useState<string>('all');
  const [source, setSource] = useState<string>('all');
  const [unresolvedOnly, setUnresolvedOnly] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: stats, refetch: refetchStats } = useAsync(
    () => ErrorsApi.stats(),
    [],
    { refetchInterval: 10_000 },
  );

  const { data, loading: isLoading, refetch: refetchList } = useAsync(
    () => ErrorsApi.list({
      level: level !== 'all' ? level : undefined,
      source: source !== 'all' ? source : undefined,
      resolved: unresolvedOnly ? 'false' : undefined,
      limit: 200,
    }),
    [level, source, unresolvedOnly],
    { refetchInterval: 5_000 },
  );

  async function resolve(id: string) {
    await ErrorsApi.resolve(id);
    toast({ variant: 'success', title: 'Eroare rezolvată' });
    refetchList();
    refetchStats();
  }

  async function resolveAll() {
    const ok = await confirmDialog({
      title: 'Marchezi toate erorile ca rezolvate?',
      description: 'Toate erorile nerezolvate vor fi mutate în starea „rezolvate".',
      confirmText: 'Rezolvă toate',
    });
    if (!ok) return;
    const res = await ErrorsApi.resolveAll();
    toast({ variant: 'success', title: `${res.affected} erori marcate ca rezolvate` });
    refetchList();
    refetchStats();
  }

  async function clearResolved() {
    const ok = await confirmDialog({
      title: 'Ștergi erorile rezolvate?',
      description: 'Toate erorile deja rezolvate vor fi șterse definitiv. Acțiunea nu poate fi anulată.',
      confirmText: 'Șterge rezolvate',
      variant: 'destructive',
    });
    if (!ok) return;
    const res = await ErrorsApi.clear(true);
    toast({ variant: 'success', title: `${res.affected} erori șterse` });
    refetchList();
    refetchStats();
  }

  async function clearAll() {
    const ok1 = await confirmDialog({
      title: 'Ștergi TOATE erorile?',
      description: 'Inclusiv cele nerezolvate. Acțiunea nu poate fi anulată.',
      confirmText: 'Continuă',
      variant: 'destructive',
    });
    if (!ok1) return;
    const ok2 = await confirmDialog({
      title: 'Confirmă încă o dată',
      description: 'Sigur ștergi definitiv toate erorile?',
      confirmText: 'Da, șterge tot',
      variant: 'destructive',
    });
    if (!ok2) return;
    const res = await ErrorsApi.clear(false);
    toast({ variant: 'success', title: `${res.affected} erori șterse` });
    refetchList();
    refetchStats();
  }

  const hasUnresolved = (stats?.unresolved ?? 0) > 0;

  return (
    <div>
      <PageHeader
        title="Erori sistem"
        description="Toate exception-urile prinse de backend + raport client-side · refresh la 5 secunde"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={resolveAll} disabled={!hasUnresolved}>
              <CheckCheck />
              Rezolvă toate
            </Button>
            <Button variant="outline" size="sm" onClick={clearResolved}>
              <Trash2 />
              Șterge rezolvate
            </Button>
            <Button variant="destructive" size="sm" onClick={clearAll}>
              <Trash2 />
              Șterge tot
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatBox
          label="Unresolved"
          value={stats?.unresolved ?? 0}
          icon={<AlertTriangle />}
          tone={stats && stats.unresolved > 0 ? 'destructive' : 'muted'}
        />
        <StatBox
          label="Error (24h)"
          value={stats?.last24h?.error ?? 0}
          icon={<XCircle />}
          tone={stats?.last24h?.error ? 'destructive' : 'muted'}
        />
        <StatBox
          label="Warn (24h)"
          value={stats?.last24h?.warn ?? 0}
          icon={<AlertTriangle />}
          tone={stats?.last24h?.warn ? 'warning' : 'muted'}
        />
        <StatBox
          label="Info (24h)"
          value={stats?.last24h?.info ?? 0}
          icon={<Info />}
          tone="info"
        />
      </div>

      <Card className="mb-5">
        <CardContent className="p-4 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <Label>Nivel</Label>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toate nivelurile</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="warn">Warn</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <Label>Sursă</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toate sursele</SelectItem>
                <SelectItem value="api">API</SelectItem>
                <SelectItem value="web">Web</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Switch
              id="unresolved-only"
              checked={unresolvedOnly}
              onCheckedChange={setUnresolvedOnly}
            />
            <label htmlFor="unresolved-only" className="text-sm cursor-pointer select-none">
              Doar nerezolvate
            </label>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (data ?? []).length === 0 ? (
        <Empty
          icon={<CheckCircle2 className="h-5 w-5" />}
          title="Niciun log"
          description="Niciun eveniment de afișat — sistemul curge fără surprize."
        />
      ) : (
        <div className="space-y-2">
          {data!.map((e) => {
            const isOpen = expanded === e.id;
            const variant = LEVEL_VARIANT[e.level] ?? 'muted';
            return (
              <div
                key={e.id}
                className={cn(
                  'border rounded-lg overflow-hidden transition-colors',
                  variant === 'destructive' && 'border-destructive/30 bg-destructive/5',
                  variant === 'warning' && 'border-warning/30 bg-warning/5',
                  variant === 'info' && 'border-info/20 bg-info/5',
                  variant === 'muted' && 'border-border bg-card',
                )}
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : e.id)}
                  className="w-full text-left p-3 flex items-start gap-3 hover:bg-white/5 transition"
                >
                  <span className="mt-0.5 text-muted-foreground">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                  <Badge variant={variant} className="uppercase tracking-wider text-[10px] flex-shrink-0">
                    {e.level}
                  </Badge>
                  <Badge variant="muted" className="flex-shrink-0">
                    {e.source}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-mono text-foreground truncate">{e.message}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 space-x-1.5">
                      {e.method && <span>{e.method}</span>}
                      {e.path && <code>{e.path}</code>}
                      {e.statusCode && <span>· {e.statusCode}</span>}
                      <span>· {format(new Date(e.createdAt), "d MMM 'la' HH:mm:ss", { locale: ro })}</span>
                      {e.resolved && <span className="text-success">· ✓ rezolvat</span>}
                    </div>
                  </div>
                  {!e.resolved && (
                    <Button
                      variant="success"
                      size="xs"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        resolve(e.id);
                      }}
                      className="flex-shrink-0"
                    >
                      <CheckCircle2 />
                      Rezolvă
                    </Button>
                  )}
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-white/5">
                    {e.stack && (
                      <pre className="mt-3 text-xs font-mono text-muted-foreground bg-background border border-border p-3 rounded overflow-x-auto whitespace-pre-wrap max-h-72">
                        {e.stack}
                      </pre>
                    )}
                    <div className="mt-3 text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
                      {e.siteId && (
                        <span className="inline-flex items-center gap-1">
                          site: <SiteBadge siteId={e.siteId} />
                        </span>
                      )}
                      {e.userId && (
                        <span>
                          user: <code>{e.userId.slice(0, 8)}</code>
                        </span>
                      )}
                      {e.guestId && (
                        <span>
                          guest: <code>{e.guestId.slice(0, 8)}</code>
                        </span>
                      )}
                      {e.ip && <span>IP: {e.ip}</span>}
                    </div>
                    {e.userAgent && (
                      <div className="text-[10px] text-muted-foreground/70 mt-1 truncate font-mono">
                        {e.userAgent}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: 'destructive' | 'warning' | 'info' | 'muted';
}) {
  const toneClass = {
    destructive: 'text-destructive bg-destructive/10',
    warning: 'text-warning bg-warning/10',
    info: 'text-info bg-info/10',
    muted: 'text-muted-foreground bg-secondary',
  }[tone];
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg [&_svg]:h-4 [&_svg]:w-4', toneClass)}>
          {icon}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            {label}
          </div>
          <div className="text-xl font-semibold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
