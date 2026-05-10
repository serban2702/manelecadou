'use client';

import {
  Activity,
  CheckCircle2,
  CircleDollarSign,
  Lock,
  Music2,
  TrendingUp,
  Unlock,
  UserCircle2,
  Users,
  XCircle,
} from 'lucide-react';
import { AdminApi } from '@/lib/api';
import { useAsync } from '@/lib/hooks/use-async';
import { cn } from '@/lib/cn';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminDashboard() {
  const { data, loading: isLoading } = useAsync(
    () => AdminApi.stats(),
    [],
    { refetchInterval: 5000 },
  );

  const fmtRon = (cents: number) =>
    `${(cents / 100).toLocaleString('ro-RO', { maximumFractionDigits: 2 })} lei`;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Snapshot live · refresh la 5 secunde"
      />

      {isLoading || !data ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
          <div className="md:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Stat
              label="Revenue total"
              value={fmtRon(data.revenue.totalCents)}
              icon={<CircleDollarSign />}
              tone="success"
              big
            />
            <Stat
              label="Revenue 7 zile"
              value={fmtRon(data.revenue.last7dCents)}
              icon={<TrendingUp />}
              tone="primary"
              big
            />
            <Stat
              label="Conversie demo → paid"
              value={`${data.conversionRate}%`}
              icon={<Activity />}
              tone="info"
              big
              sub={`${data.generations.paidUnlocked} unlocks din ${data.generations.demos} demo`}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Users" value={data.users} icon={<UserCircle2 />} />
            <Stat label="Guests" value={data.guests} icon={<Users />} />
            <Stat label="Generations" value={data.generations.total} icon={<Music2 />} />
            <Stat label="Paid payments" value={data.paidPayments} icon={<CircleDollarSign />} />
            <Stat
              label="Demo"
              value={data.generations.demos}
              icon={<Lock />}
              sub={`${data.generations.fulls} full`}
            />
            <Stat
              label="Succeeded"
              value={data.generations.succeeded}
              icon={<CheckCircle2 />}
              tone="success"
            />
            <Stat label="Failed" value={data.generations.failed} icon={<XCircle />} tone="destructive" />
            <Stat
              label="Unlocked"
              value={data.generations.paidUnlocked}
              icon={<Unlock />}
              tone="success"
            />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  icon,
  tone = 'default',
  big = false,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'success' | 'destructive' | 'primary' | 'info';
  big?: boolean;
}) {
  const toneClass = {
    default: 'text-foreground',
    success: 'text-success',
    destructive: 'text-destructive',
    primary: 'text-primary',
    info: 'text-info',
  }[tone];
  const iconBg = {
    default: 'bg-secondary text-muted-foreground',
    success: 'bg-success/10 text-success',
    destructive: 'bg-destructive/10 text-destructive',
    primary: 'bg-primary/10 text-primary',
    info: 'bg-info/10 text-info',
  }[tone];

  return (
    <Card className="surface">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              {label}
            </div>
            <div
              className={cn(
                'mt-1 font-semibold tabular-nums truncate',
                big ? 'text-2xl' : 'text-xl',
                toneClass,
              )}
            >
              {value}
            </div>
            {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
          </div>
          {icon && (
            <div
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg [&_svg]:h-4 [&_svg]:w-4',
                iconBg,
              )}
            >
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
