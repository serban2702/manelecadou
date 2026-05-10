'use client';

import { useAsync } from "@/lib/hooks/use-async";
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { CalendarPlus, Gift } from 'lucide-react';
import { GiftCodesApi } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { PageHeader } from '@/components/ui/page-header';
import { promptDialog } from '@/components/ui/prompt-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { SiteBadge } from '@/components/site-badge';
import { useSitesMap } from '@/lib/hooks/use-sites-map';

const TIER_LABEL: Record<string, { label: string; variant: 'default' | 'info' | 'success' }> = {
  single: { label: '1 melodie', variant: 'default' },
  pack3: { label: '3 melodii', variant: 'info' },
  pack10: { label: '10 melodii', variant: 'success' },
};

export default function AdminGiftCodesPage() {
  const { toast } = useToast();
  const { isAllSelected } = useSitesMap();
  const { data, loading: isLoading, refetch } = useAsync(
    () => GiftCodesApi.list(),
    [],
    { refetchInterval: 10_000 },
  );

  async function toggle(id: string, active: boolean) {
    await GiftCodesApi.setActive(id, active);
    refetch();
  }

  async function extend(id: string, code: string) {
    const v = await promptDialog({
      title: `Prelungește ${code}`,
      description: 'Cu câte zile prelungești valabilitatea?',
      label: 'Zile',
      type: 'number',
      defaultValue: '30',
      confirmText: 'Prelungește',
    });
    if (!v) return;
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n <= 0) {
      toast({ variant: 'destructive', title: 'Valoare invalidă' });
      return;
    }
    await GiftCodesApi.extend(id, n);
    toast({ variant: 'success', title: `Prelungit cu ${n} zile` });
    refetch();
  }

  return (
    <div>
      <PageHeader
        title="Coduri cadou"
        description="Cumpărate de useri/guests, valabile 1 an. Refresh la 10 secunde."
      />

      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (data ?? []).length === 0 ? (
        <Empty
          icon={<Gift className="h-5 w-5" />}
          title="Niciun cod cadou încă"
          description="Aici apar codurile cumpărate de utilizatori."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cod</TableHead>
              {isAllSelected && <TableHead>Site</TableHead>}
              <TableHead>Pachet</TableHead>
              <TableHead>Utilizări</TableHead>
              <TableHead>Cumpărător</TableHead>
              <TableHead>Valabil până</TableHead>
              <TableHead>Ultima folosire</TableHead>
              <TableHead>Activ</TableHead>
              <TableHead className="text-right">Acțiuni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).map((c) => {
              const tier = TIER_LABEL[c.tier] ?? { label: c.tier, variant: 'default' as const };
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <code className="font-mono font-semibold text-primary">{c.code}</code>
                  </TableCell>
                  {isAllSelected && (
                    <TableCell>
                      <SiteBadge siteId={c.siteId} />
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge variant={tier.variant}>{tier.label}</Badge>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {c.usesLeft} / {c.totalUses}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.purchasedByEmail ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(c.validUntil), 'd MMM yyyy', { locale: ro })}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.lastRedeemedAt
                      ? format(new Date(c.lastRedeemedAt), "d MMM yyyy 'la' HH:mm", { locale: ro })
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={c.active}
                      onCheckedChange={(v) => toggle(c.id, v)}
                      aria-label={`Activează ${c.code}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="xs" onClick={() => extend(c.id, c.code)}>
                      <CalendarPlus />
                      Prelungește
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
