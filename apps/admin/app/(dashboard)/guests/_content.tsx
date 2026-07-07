'use client';

import { useAsync } from "@/lib/hooks/use-async";
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { Users2 } from 'lucide-react';
import { AdminApi } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
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

function flagEmoji(countryCode: string | null): string {
  if (!countryCode || countryCode.length !== 2) return '';
  const A = 0x1f1e6;
  const cc = countryCode.toUpperCase();
  return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65);
}

/** Progresul în wizard-ul de comandă: badge + bară cu 5 segmente. */
function WizardProgress({
  wizard,
}: {
  wizard: { stage: number; fieldsTouched: number; lastEventAt: string | null } | null | undefined;
}) {
  const stage = wizard?.stage ?? 0;
  const labels: Array<{ text: string; variant: 'muted' | 'secondary' | 'default' | 'success' }> = [
    { text: 'Doar vizită', variant: 'muted' },
    { text: 'Formular deschis', variant: 'secondary' },
    { text: `Completează (${wizard?.fieldsTouched ?? 0} câmpuri)`, variant: 'secondary' },
    { text: 'Comandă creată', variant: 'default' },
    { text: 'La plată', variant: 'default' },
    { text: 'A plătit', variant: 'success' },
  ];
  const l = labels[Math.min(stage, 5)];
  return (
    <div className="flex flex-col gap-1 min-w-[120px]">
      <Badge variant={l.variant} className="w-fit whitespace-nowrap">{l.text}</Badge>
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className={
              'h-1 w-4 rounded-full ' +
              (i < stage ? (stage >= 5 ? 'bg-success' : 'bg-primary') : 'bg-secondary')
            }
          />
        ))}
      </div>
    </div>
  );
}

export default function GuestsPage() {
  const { data, loading: isLoading } = useAsync(() => AdminApi.guests(), []);
  const { isAllSelected } = useSitesMap();

  return (
    <div>
      <PageHeader title="Sesiuni guest" description="Vizitatori fără cont" />

      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (data ?? []).length === 0 ? (
        <Empty icon={<Users2 className="h-5 w-5" />} title="Nicio sesiune guest" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ultima activitate</TableHead>
              {isAllSelected && <TableHead>Site</TableHead>}
              <TableHead>Email</TableHead>
              <TableHead>Locație</TableHead>
              <TableHead>Device</TableHead>
              <TableHead>Sursă</TableHead>
              <TableHead>Wizard</TableHead>
              <TableHead className="text-right">Vizite</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data!.map((g) => {
              const a = g.analytics;
              return (
                <TableRow key={g.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(g.lastSeenAt), "d MMM yyyy 'la' HH:mm", { locale: ro })}
                  </TableCell>
                  {isAllSelected && (
                    <TableCell>
                      <SiteBadge siteId={g.siteId} />
                    </TableCell>
                  )}
                  <TableCell className="text-xs">
                    {g.email ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-xs">
                    {a?.country ? (
                      <span title={`${a.countryName ?? a.country}${a.city ? ` · ${a.city}` : ''}`}>
                        {flagEmoji(a.country)} {a.city ?? a.countryName ?? a.country}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {a?.device || a?.browserName ? (
                      <span title={`${a.osName ?? ''} · ${a.browserName ?? ''}`} className="whitespace-nowrap">
                        {a.device ?? '?'} · {a.browserName ?? '?'}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {a?.source ? (
                      <span title={a.medium ? `${a.source} / ${a.medium}` : a.source}>
                        {a.source}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">direct</span>
                    )}
                  </TableCell>
                  <TableCell
                    title={
                      g.wizard?.lastEventAt
                        ? `Ultima acțiune în wizard: ${format(new Date(g.wizard.lastEventAt), "d MMM yyyy 'la' HH:mm", { locale: ro })}`
                        : undefined
                    }
                  >
                    <WizardProgress wizard={g.wizard} />
                  </TableCell>
                  <TableCell className="text-xs text-right font-mono tabular-nums">
                    {a?.pageViews ?? 0}
                  </TableCell>
                  <TableCell>
                    {g.freeDemoUsed && <Badge variant="muted">demo</Badge>}
                    {g.userId && <Badge variant="success">cont</Badge>}
                    {a?.isBot && <Badge variant="destructive">{a.botCategory}</Badge>}
                    {!g.freeDemoUsed && !g.userId && !a?.isBot && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs text-muted-foreground">{g.id.slice(0, 8)}</code>
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
