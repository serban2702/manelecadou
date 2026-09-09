'use client';

import { useCallback, useEffect, useState } from 'react';
import { EyeOff, Loader2, Trash2, TriangleAlert } from 'lucide-react';
import { AdminIpsApi, type AdminIpRow } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/cn';

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Lista IP-urilor de pe care s-a intrat în admin. Sesiunile venite de pe ele
 * sunt scoase din rapoarte.
 *
 * Ecranul există în primul rând ca plasă de siguranță: lista se completează
 * singură, iar un admin care intră o dată de pe date mobile aduce aici IP-ul
 * operatorului, partajat cu mii de clienți reali. De aceea fiecare rând poate fi
 * dezactivat, iar butonul de recalculare arată întâi câte sesiuni ar atinge.
 */
export function InternalTrafficCard() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AdminIpRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ ips: number; sessions: number } | null>(null);
  const [backfilling, setBackfilling] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, prev] = await Promise.all([
        AdminIpsApi.list(),
        AdminIpsApi.previewBackfill().catch(() => null),
      ]);
      setRows(list);
      setPreview(prev);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Nu s-a putut încărca lista', description: (e as Error).message });
      setRows([]);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (row: AdminIpRow, enabled: boolean) => {
    setBusy(row.id);
    setRows((cur) => cur?.map((r) => (r.id === row.id ? { ...r, enabled } : r)) ?? cur);
    try {
      await AdminIpsApi.patch(row.id, { enabled });
      const prev = await AdminIpsApi.previewBackfill().catch(() => null);
      setPreview(prev);
    } catch (e) {
      setRows((cur) => cur?.map((r) => (r.id === row.id ? { ...r, enabled: !enabled } : r)) ?? cur);
      toast({ variant: 'destructive', title: 'Nu s-a putut salva', description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (row: AdminIpRow) => {
    const ok = await confirmDialog({
      title: `Ștergi ${row.ip}?`,
      description:
        'Sesiunile deja marcate ca interne rămân marcate. Dacă intri din nou în admin de pe acest IP, va reapărea automat în listă.',
      confirmText: 'Șterge',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(row.id);
    try {
      await AdminIpsApi.remove(row.id);
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Nu s-a putut șterge', description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const runBackfill = async () => {
    const n = preview?.sessions ?? 0;
    const ok = await confirmDialog({
      title: 'Recalculezi istoricul?',
      description:
        n > 0
          ? `${n.toLocaleString('ro-RO')} sesiuni vechi vor fi marcate ca trafic intern și vor dispărea din rapoarte. Cifrele istorice pe care le-ai comparat până acum se vor schimba.`
          : 'Nu există sesiuni vechi de marcat pentru IP-urile active.',
      confirmText: 'Recalculează',
    });
    if (!ok) return;
    setBackfilling(true);
    try {
      const res = await AdminIpsApi.backfill();
      toast({
        variant: 'success',
        title: 'Istoric recalculat',
        description: `${res.updated.toLocaleString('ro-RO')} sesiuni marcate ca interne.`,
      });
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Recalcularea a eșuat', description: (e as Error).message });
    } finally {
      setBackfilling(false);
    }
  };

  const activeCount = rows?.filter((r) => r.enabled).length ?? 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <EyeOff className="h-4 w-4 text-primary" />
          Trafic intern (exclus din rapoarte)
        </CardTitle>
        <CardDescription>
          IP-urile de pe care s-a intrat în admin. Sesiunile venite de pe ele nu mai apar în
          analytics, în marketing sau în statisticile de email. Lista se completează singură.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Dacă intri în admin de pe date mobile, aici ajunge IP-ul operatorului — partajat cu
            mii de clienți reali, care dispar și ei din rapoarte. Dacă vezi o scădere neexplicată
            de sesiuni, oprește rândul suspect de mai jos.
          </p>
        </div>

        {rows === null && (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        )}

        {rows?.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">
            Încă niciun IP. Apare unul de îndată ce un admin face o acțiune în panou.
          </p>
        )}

        {rows && rows.length > 0 && (
          <div className="divide-y divide-border">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate font-mono text-sm', !row.enabled && 'text-muted-foreground line-through')}>
                    {row.ip}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {row.label ? `${row.label} · ` : ''}văzut {formatWhen(row.lastSeenAt)}
                  </p>
                </div>
                {busy === row.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                <Switch
                  checked={row.enabled}
                  disabled={busy === row.id}
                  aria-label={`Exclude traficul de pe ${row.ip}`}
                  onCheckedChange={(v) => void toggle(row, v)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy === row.id}
                  onClick={() => void remove(row)}
                  aria-label={`Șterge ${row.ip}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            {activeCount} IP{activeCount === 1 ? '' : '-uri'} active
            {preview && preview.sessions > 0
              ? ` · ${preview.sessions.toLocaleString('ro-RO')} sesiuni vechi încă nemarcate`
              : ' · istoricul e la zi'}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={backfilling || !preview || preview.sessions === 0}
            onClick={() => void runBackfill()}
          >
            {backfilling && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Recalculează istoricul
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
