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
              <TableHead>Demo</TableHead>
              <TableHead>Reclamat de</TableHead>
              <TableHead>ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data!.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(g.lastSeenAt), "d MMM yyyy 'la' HH:mm", { locale: ro })}
                </TableCell>
                {isAllSelected && (
                  <TableCell>
                    <SiteBadge siteId={g.siteId} />
                  </TableCell>
                )}
                <TableCell>
                  {g.email ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  {g.freeDemoUsed ? (
                    <Badge variant="muted">folosit</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {g.userId ? (
                    <code className="text-xs">{g.userId.slice(0, 8)}</code>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <code className="text-xs text-muted-foreground">{g.id.slice(0, 8)}</code>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
