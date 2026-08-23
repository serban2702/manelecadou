'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ClipboardList, Loader2, Sparkles, Wand2 } from 'lucide-react';
import {
  SitesApi,
  setSelectedSiteId,
  type SiteRolloutCheck,
  type SiteRolloutSiteRow,
  type RolloutStatus,
} from '@/lib/api/sites.api';
import { useAsync } from '@/lib/hooks/use-async';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { useSpaNavigate } from '@/lib/spa-router';
import { cn } from '@/lib/cn';

const STATUS_BADGE: Record<RolloutStatus, { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' }> = {
  ok: { label: 'Gata', variant: 'success' },
  partial: { label: 'Parțial', variant: 'warning' },
  missing: { label: 'Lipsește', variant: 'destructive' },
  info: { label: 'Info', variant: 'muted' },
};

export default function RolloutPage() {
  const { toast } = useToast();
  const navigate = useSpaNavigate();
  const { data, loading, refetch } = useAsync(() => SitesApi.rolloutOverview(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const autoIds = useMemo(
    () => (data?.checks ?? []).filter((c) => c.autoApply).map((c) => c.id),
    [data],
  );

  async function applySite(siteId: string) {
    setBusy(siteId);
    try {
      const res = await SitesApi.rolloutApplySite(siteId, autoIds);
      toast({
        variant: 'success',
        title: 'Seed aplicat',
        description:
          res.applied.length === 0
            ? 'Nimic de umplut — tot ce e auto e deja setat.'
            : `Completat: ${res.applied.join(', ')}`,
      });
      await refetch();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function applyAll() {
    const ok = await confirmDialog({
      title: 'Umple golurile pe toate site-urile?',
      description:
        'Completează doar câmpurile goale: prompturi Suno/Google din seed și activează interfața Cadou. Nu atinge textul deja salvat, prețurile sau motorul audio.',
      confirmText: 'Aplică seed-ul',
    });
    if (!ok) return;
    setBusy('all');
    try {
      await SitesApi.rolloutApplyAll(autoIds);
      toast({ variant: 'success', title: 'Seed aplicat pe toate site-urile' });
      await refetch();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  function openStudio(site: SiteRolloutSiteRow) {
    setSelectedSiteId(site.id);
    navigate('/site');
  }

  if (loading || !data) {
    return (
      <div>
        <PageHeader title="Lansare producție" description="Ce trebuie setat pe fiecare site după lucrările din acest branch." />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Lansare producție"
        description="Checklist-ul a tot ce trebuie pe site-urile live: prompturi Google, interfața Cadou, cheia Gemini, mostre. Seed-ul umple doar golurile — nu rescrie ce ai setat deja."
        actions={
          <Button onClick={applyAll} disabled={busy !== null || data.totals.autoFixable === 0}>
            {busy === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Umple golurile pe toate ({data.totals.autoFixable})
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        <Stat label="Site-uri" value={data.totals.sites} />
        <Stat label="Cu goluri" value={data.totals.sitesWithGaps} warn={data.totals.sitesWithGaps > 0} />
        <Stat label="Auto-reparabile" value={data.totals.autoFixable} />
      </div>

      <Card className="mb-6">
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-medium">Platformă (toate site-urile)</div>
          {data.global.map((c) => (
            <CheckRow key={c.id} check={c} />
          ))}
        </CardContent>
      </Card>

      <div className="space-y-2">
        {data.sites.map((site) => {
          const open = openId === site.id;
          return (
            <Card key={site.id} className={cn(!site.active && 'opacity-70')}>
              <CardContent className="p-0">
                <button
                  type="button"
                  className="w-full text-left px-4 py-3 flex items-center gap-3"
                  onClick={() => setOpenId(open ? null : site.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{site.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">{site.domain}</span>
                      <Badge variant="outline">{site.musicEngine === 'google' ? 'Lyria' : 'Suno'}</Badge>
                      {site.missing === 0 && site.partial === 0 ? (
                        <Badge variant="success">
                          <CheckCircle2 className="h-3 w-3" /> Complet
                        </Badge>
                      ) : (
                        <Badge variant="warning">
                          {site.missing} lipsă · {site.partial} parțiale
                        </Badge>
                      )}
                    </div>
                  </div>
                  <ChevronDown className={cn('h-4 w-4 text-muted-foreground shrink-0 transition-transform', open && 'rotate-180')} />
                </button>
                {open && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                    {site.checks.map((c) => (
                      <CheckRow key={c.id} check={c} />
                    ))}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => applySite(site.id)}
                        disabled={busy !== null || site.autoFixable === 0}
                      >
                        {busy === site.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        Umple golurile ({site.autoFixable})
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openStudio(site)}>
                        Deschide Acest site
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-muted-foreground max-w-2xl">
        Ca să adaugi un check nou: un obiect în <code>ROLLOUT_CHECKS</code> din{' '}
        <code>apps/api/src/modules/sites/site-rollout.service.ts</code>. Dacă se poate umple din seed,
        pune <code>autoApply: true</code> și logica în <code>buildPatch</code>.
      </p>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className={cn('text-2xl font-semibold tabular-nums', warn && 'text-warning')}>{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </CardContent>
    </Card>
  );
}

function CheckRow({ check }: { check: SiteRolloutCheck }) {
  const badge = STATUS_BADGE[check.status];
  return (
    <div className="flex items-start gap-3">
      <ClipboardList className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{check.title}</span>
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {check.autoApply && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">auto</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{check.detail || check.description}</p>
      </div>
    </div>
  );
}
