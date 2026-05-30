'use client';

import { useMemo, useState } from 'react';
import { useAsync } from "@/lib/hooks/use-async";
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { ro } from 'date-fns/locale';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Eye,
  Globe,
  Megaphone,
  MousePointerClick,
  RefreshCw,
  Smartphone,
  Target,
  Timer,
  TrendingUp,
  UserCircle2,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import { AnalyticsApi, type AdSpendPlatform } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DateRangePicker, type DateRangeValue } from '@/components/ui/date-range-picker';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const RON = (cents: number) =>
  `${(cents / 100).toLocaleString('ro-RO', { maximumFractionDigits: 2 })} lei`;

const PIE_COLORS = ['hsl(45 84% 62%)', 'hsl(217 91% 65%)', 'hsl(158 64% 52%)', 'hsl(38 92% 60%)', 'hsl(0 72% 56%)', 'hsl(280 65% 60%)'];

function pct(curr: number, prev: number): { value: number; up: boolean } | null {
  if (prev <= 0) return null;
  const diff = ((curr - prev) / prev) * 100;
  return { value: Math.round(Math.abs(diff) * 10) / 10, up: diff >= 0 };
}

function fmtDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  return `${m}m ${s}s`;
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<DateRangeValue>({
    from: startOfDay(subDays(new Date(), 6)),
    to: endOfDay(new Date()),
  });
  const rangeISO = useMemo(
    () => ({ from: range.from.toISOString(), to: range.to.toISOString() }),
    [range],
  );

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Sesiuni, conversii, revenue · cross-check Stripe + Pixel/GA4"
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />

      <Tabs defaultValue="overview">
        <TabsList className="mb-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="sessions">Sesiuni</TabsTrigger>
          <TabsTrigger value="tech">Tech &amp; Geo</TabsTrigger>
          <TabsTrigger value="bots">Boți</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="ads">Ads &amp; ROAS</TabsTrigger>
          <TabsTrigger value="cross-check">Cross-check</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab range={rangeISO} />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab range={rangeISO} />
        </TabsContent>
        <TabsContent value="sessions">
          <SessionsTab range={rangeISO} />
        </TabsContent>
        <TabsContent value="tech">
          <TechTab range={rangeISO} />
        </TabsContent>
        <TabsContent value="bots">
          <BotsTab range={rangeISO} />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentsTab range={rangeISO} />
        </TabsContent>
        <TabsContent value="ads">
          <AdsTab range={rangeISO} />
        </TabsContent>
        <TabsContent value="cross-check">
          <CrossCheckTab range={rangeISO} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============== OVERVIEW ==============

function OverviewTab({ range }: { range: { from: string; to: string } }) {
  const overview = useAsync(() => AnalyticsApi.overview(range), [range]);
  const ts = useAsync(() => AnalyticsApi.timeSeries(range), [range]);
  const funnel = useAsync(() => AnalyticsApi.funnel(range), [range]);
  const sources = useAsync(() => AnalyticsApi.sources(range), [range]);
  const topPages = useAsync(() => AnalyticsApi.topPages(range), [range]);
  const devices = useAsync(() => AnalyticsApi.devices(range), [range]);

  const o = overview.data;
  const sessionsTrend = o ? pct(o.sessions, o.previous.sessions) : null;
  const visitorsTrend = o ? pct(o.visitors, o.previous.visitors) : null;
  const revenueTrend = o ? pct(o.revenueCents, o.previous.revenueCents) : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Sesiuni"
          value={o?.sessions}
          trend={sessionsTrend}
          icon={<Activity />}
          tone="primary"
          loading={overview.isLoading}
        />
        <KpiCard
          label="Vizitatori unici"
          value={o?.visitors}
          trend={visitorsTrend}
          icon={<UserCircle2 />}
          tone="info"
          loading={overview.isLoading}
        />
        <KpiCard
          label="Pagini vizionate"
          value={o?.pageViews}
          icon={<Eye />}
          tone="success"
          loading={overview.isLoading}
        />
        <KpiCard
          label="Revenue"
          value={o ? RON(o.revenueCents) : undefined}
          trend={revenueTrend}
          icon={<CircleDollarSign />}
          tone="primary"
          loading={overview.isLoading}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Durată medie sesiune"
          value={o ? fmtDuration(o.avgSessionSec) : undefined}
          icon={<Timer />}
          loading={overview.isLoading}
        />
        <KpiCard
          label="Bounce rate"
          value={o ? `${o.bounceRate}%` : undefined}
          icon={<ArrowDownRight />}
          tone={o && o.bounceRate > 70 ? 'destructive' : undefined}
          loading={overview.isLoading}
        />
        <KpiCard
          label="Plăți cu succes"
          value={o?.paidCount}
          icon={<CheckCircle2 />}
          tone="success"
          loading={overview.isLoading}
        />
        <KpiCard
          label="Pixel purchases"
          value={o?.pixelPurchases}
          sub={o?.pixelRevenueCents ? RON(o.pixelRevenueCents) : undefined}
          icon={<TrendingUp />}
          tone="info"
          loading={overview.isLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sesiuni & Pageviews</CardTitle>
            <CardDescription>Activitate zilnică pe perioada selectată</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {ts.isLoading || !ts.data ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ts.data.sessions.map((d) => ({ ...d, day: format(new Date(d.bucket), 'd MMM', { locale: ro }) }))}>
                  <defs>
                    <linearGradient id="grSessions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(45 84% 62%)" stopOpacity={0.55} />
                      <stop offset="95%" stopColor="hsl(45 84% 62%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="grVisitors" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(217 91% 65%)" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="hsl(217 91% 65%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(220 17% 16%)" strokeDasharray="3 3" />
                  <XAxis dataKey="day" stroke="hsl(220 9% 60%)" fontSize={11} tickLine={false} />
                  <YAxis stroke="hsl(220 9% 60%)" fontSize={11} tickLine={false} axisLine={false} />
                  <ReTooltip contentStyle={chartTooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Area type="monotone" dataKey="sessions" name="Sesiuni" stroke="hsl(45 84% 62%)" fill="url(#grSessions)" strokeWidth={2} />
                  <Area type="monotone" dataKey="visitors" name="Vizitatori" stroke="hsl(217 91% 65%)" fill="url(#grVisitors)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Devices</CardTitle>
            <CardDescription>Distribuție pe tipuri de device</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {devices.isLoading || !devices.data ? (
              <Skeleton className="h-full w-full" />
            ) : devices.data.length === 0 ? (
              <Empty title="Date insuficiente" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={devices.data}
                    dataKey="sessions"
                    nameKey="device"
                    innerRadius={45}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {devices.data.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <ReTooltip contentStyle={chartTooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Funnel conversie</CardTitle>
            <CardDescription>Pași unici de sesiuni de la page view la achiziție</CardDescription>
          </CardHeader>
          <CardContent>
            {funnel.isLoading || !funnel.data ? (
              <Skeleton className="h-44 w-full" />
            ) : (
              <div className="space-y-2.5">
                {funnel.data.map((s) => (
                  <div key={s.step}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium capitalize">{s.step.replace(/_/g, ' ')}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {s.count.toLocaleString('ro-RO')} <span className="text-xs">({s.rateOfTotal}%)</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-amber-300 rounded-full"
                        style={{ width: `${s.rateOfTotal}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top pagini</CardTitle>
            <CardDescription>Cele mai vizitate pagini din interval</CardDescription>
          </CardHeader>
          <CardContent>
            {topPages.isLoading || !topPages.data ? (
              <Skeleton className="h-44 w-full" />
            ) : topPages.data.length === 0 ? (
              <Empty title="Niciun page view" />
            ) : (
              <div className="divide-y divide-border">
                {topPages.data.slice(0, 8).map((p) => (
                  <div key={p.path} className="flex items-center justify-between py-2 text-sm">
                    <code className="text-xs text-muted-foreground truncate max-w-[60%]">{p.path}</code>
                    <div className="flex items-center gap-3 tabular-nums">
                      <span className="text-muted-foreground text-xs">
                        {p.uniqueSessions.toLocaleString('ro-RO')} sesiuni
                      </span>
                      <Badge variant="muted">{p.views.toLocaleString('ro-RO')}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <CardTitle>Surse de trafic</CardTitle>
          </div>
          <CardDescription>De unde vin sesiunile (UTM source / referrer / direct)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {sources.isLoading || !sources.data ? (
            <Skeleton className="h-44 w-full" />
          ) : sources.data.length === 0 ? (
            <Empty title="Date insuficiente" className="m-5" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sursă</TableHead>
                  <TableHead className="text-right">Sesiuni</TableHead>
                  <TableHead className="text-right">Durată medie</TableHead>
                  <TableHead className="text-right">Bounce</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.data.map((s) => (
                  <TableRow key={s.source}>
                    <TableCell className="font-medium capitalize">{s.source}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.sessions.toLocaleString('ro-RO')}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {fmtDuration(s.avgSessionSec)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={cn(s.bounceRate > 70 ? 'text-destructive' : 'text-muted-foreground')}>
                        {s.bounceRate}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============== USERS ==============

function UsersTab({ range }: { range: { from: string; to: string } }) {
  const usersQ = useAsync(() => AnalyticsApi.users(range), [range]);
  const overview = useAsync(() => AnalyticsApi.overview(range), [range]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total useri"
          value={usersQ.data?.totalUsers}
          icon={<Users />}
          tone="primary"
          loading={usersQ.isLoading}
        />
        <KpiCard
          label="Useri reveniți (perioada)"
          value={usersQ.data?.returningUsers}
          icon={<UserCircle2 />}
          tone="success"
          loading={usersQ.isLoading}
        />
        <KpiCard
          label="Înscrieri (perioada)"
          value={overview.data?.eventCounts['signup'] ?? 0}
          icon={<UserCircle2 />}
          loading={overview.isLoading}
        />
        <KpiCard
          label="Login-uri"
          value={overview.data?.eventCounts['login'] ?? 0}
          icon={<Activity />}
          loading={overview.isLoading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Useri noi pe zi</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {usersQ.isLoading || !usersQ.data ? (
            <Skeleton className="h-full w-full" />
          ) : usersQ.data.newUsersTimeSeries.length === 0 ? (
            <Empty title="Niciun user nou în perioadă" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={usersQ.data.newUsersTimeSeries.map((d) => ({
                  day: format(new Date(d.bucket), 'd MMM', { locale: ro }),
                  count: d.count,
                }))}
              >
                <CartesianGrid stroke="hsl(220 17% 16%)" strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke="hsl(220 9% 60%)" fontSize={11} tickLine={false} />
                <YAxis stroke="hsl(220 9% 60%)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <ReTooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="count" name="Useri noi" fill="hsl(45 84% 62%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============== PAYMENTS ==============

function PaymentsTab({ range }: { range: { from: string; to: string } }) {
  const overview = useAsync(() => AnalyticsApi.overview(range), [range]);
  const ts = useAsync(() => AnalyticsApi.timeSeries(range), [range]);
  const recon = useAsync(() => AnalyticsApi.stripeReconciliation(range), [range]);

  const o = overview.data;
  const recDiff = o ? o.revenueCents - o.pixelRevenueCents : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Revenue (intern)"
          value={o ? RON(o.revenueCents) : undefined}
          icon={<CircleDollarSign />}
          tone="primary"
          loading={overview.isLoading}
        />
        <KpiCard
          label="Pixel revenue"
          value={o ? RON(o.pixelRevenueCents) : undefined}
          sub="raportat de tracker"
          icon={<TrendingUp />}
          tone="info"
          loading={overview.isLoading}
        />
        <KpiCard
          label="Diferență"
          value={o ? RON(Math.abs(recDiff)) : undefined}
          sub={recDiff === 0 ? 'în concordanță' : recDiff > 0 ? 'mai puțin în pixel' : 'mai mult în pixel'}
          icon={<AlertTriangle />}
          tone={Math.abs(recDiff) > 0 ? 'warning' : 'success'}
          loading={overview.isLoading}
        />
        <KpiCard
          label="Plăți paid"
          value={o?.paidCount}
          icon={<CheckCircle2 />}
          tone="success"
          loading={overview.isLoading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue pe zi</CardTitle>
          <CardDescription>Total în RON · ordonat cronologic</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {ts.isLoading || !ts.data ? (
            <Skeleton className="h-full w-full" />
          ) : ts.data.revenue.length === 0 ? (
            <Empty title="Niciun revenue în perioadă" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={ts.data.revenue.map((d) => ({
                  day: format(new Date(d.bucket), 'd MMM', { locale: ro }),
                  ron: d.revenueCents / 100,
                  count: d.count,
                }))}
              >
                <defs>
                  <linearGradient id="grRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(158 64% 52%)" stopOpacity={0.55} />
                    <stop offset="95%" stopColor="hsl(158 64% 52%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(220 17% 16%)" strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke="hsl(220 9% 60%)" fontSize={11} tickLine={false} />
                <YAxis stroke="hsl(220 9% 60%)" fontSize={11} tickLine={false} axisLine={false} />
                <ReTooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(v) => [`${Number(v).toLocaleString('ro-RO')} lei`, 'Revenue']}
                />
                <Area type="monotone" dataKey="ron" name="Revenue (lei)" stroke="hsl(158 64% 52%)" fill="url(#grRevenue)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            <CardTitle>Reconciliere Stripe</CardTitle>
          </div>
          <CardDescription>
            Comparație DB locală ↔ Stripe API. „matched" = OK, restul necesită investigare.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recon.isLoading ? (
            <Skeleton className="h-44 w-full" />
          ) : !recon.data?.configured ? (
            <Empty
              icon={<AlertTriangle className="h-5 w-5" />}
              title="Stripe nu e configurat"
              description="Setează STRIPE_SECRET_KEY pentru a activa reconcilierea."
            />
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <ReconStat label="Matched" value={recon.data.summary.matched} tone="success" />
                <ReconStat label="Lipsă în local" value={recon.data.summary.missingInLocal} tone="destructive" />
                <ReconStat label="Lipsă în Stripe" value={recon.data.summary.missingInStripe} tone="warning" />
                <ReconStat label="Sumă diferită" value={recon.data.summary.amountMismatch} tone="warning" />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-5 text-xs text-muted-foreground">
                <div>
                  Stripe: <b className="text-foreground tabular-nums">{recon.data.summary.stripePaid}</b>{' '}
                  plăți · <b className="text-foreground tabular-nums">{RON(recon.data.summary.stripeAmountCents)}</b>
                </div>
                <div>
                  Local: <b className="text-foreground tabular-nums">{recon.data.summary.localPaid}</b>{' '}
                  plăți · <b className="text-foreground tabular-nums">{RON(recon.data.summary.localAmountCents)}</b>
                </div>
              </div>
              {recon.data.rows.length === 0 ? (
                <Empty title="Nicio plată în interval" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Stripe session</TableHead>
                      <TableHead className="text-right">Stripe</TableHead>
                      <TableHead className="text-right">Local</TableHead>
                      <TableHead>Plată locală</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recon.data.rows.slice(0, 60).map((r) => (
                      <TableRow key={r.sessionId + r.status}>
                        <TableCell>
                          <ReconBadge status={r.status} />
                        </TableCell>
                        <TableCell>
                          <code className="text-xs text-muted-foreground">{r.sessionId.slice(0, 18)}...</code>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.stripeAmountCents != null
                            ? `${(r.stripeAmountCents / 100).toFixed(2)} ${r.currency.toUpperCase()}`
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.localAmountCents != null
                            ? `${(r.localAmountCents / 100).toFixed(2)} ${r.currency.toUpperCase()}`
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {r.localId ? (
                            <code className="text-xs text-muted-foreground">{r.localId.slice(0, 8)}</code>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.paidAt ? format(new Date(r.paidAt), "d MMM 'la' HH:mm", { locale: ro }) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============== CROSS-CHECK ==============

function CrossCheckTab({ range }: { range: { from: string; to: string } }) {
  const cc = useAsync(() => AnalyticsApi.pixelCrossCheck(range), [range]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Status pixel/GA4</CardTitle>
          <CardDescription>
            Forward-uri server-side cu același <code>event_id</code> ca clientul → permit dedup în Meta/GA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cc.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              <Card className={cc.data?.ga4Enabled ? 'border-success/30' : ''}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div
                    className={cn(
                      'h-9 w-9 rounded-lg flex items-center justify-center [&_svg]:h-4 [&_svg]:w-4',
                      cc.data?.ga4Enabled ? 'bg-success/10 text-success' : 'bg-secondary text-muted-foreground',
                    )}
                  >
                    <Activity />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                      Google Analytics 4
                    </div>
                    <div className="text-base font-semibold">
                      {cc.data?.ga4Enabled ? 'Activ (Measurement Protocol)' : 'Inactiv — setează GA4_MEASUREMENT_ID + GA4_API_SECRET'}
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className={cc.data?.capiEnabled ? 'border-success/30' : ''}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div
                    className={cn(
                      'h-9 w-9 rounded-lg flex items-center justify-center [&_svg]:h-4 [&_svg]:w-4',
                      cc.data?.capiEnabled ? 'bg-success/10 text-success' : 'bg-secondary text-muted-foreground',
                    )}
                  >
                    <Smartphone />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                      Meta Conversions API
                    </div>
                    <div className="text-base font-semibold">
                      {cc.data?.capiEnabled
                        ? 'Activ (server-side)'
                        : 'Inactiv — setează META_PIXEL_ID + META_CAPI_TOKEN'}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {cc.data && cc.data.events.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Eveniment</TableHead>
                  <TableHead className="text-right">Capturat (intern)</TableHead>
                  <TableHead className="text-right">Forward OK</TableHead>
                  <TableHead className="text-right">Forward eșuat</TableHead>
                  <TableHead className="text-right">Skipped</TableHead>
                  <TableHead className="text-right">Coverage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cc.data.events.map((e) => (
                  <TableRow key={e.type}>
                    <TableCell className="font-medium capitalize">{e.type.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="text-right tabular-nums">{e.captured.toLocaleString('ro-RO')}</TableCell>
                    <TableCell className="text-right tabular-nums text-success">{e.forwarded}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {e.failed > 0 ? <span className="text-destructive">{e.failed}</span> : <span className="text-muted-foreground">0</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{e.skipped}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Badge variant={e.coverage >= 95 ? 'success' : e.coverage >= 70 ? 'warning' : 'destructive'}>
                        {e.coverage}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            <b>Cum funcționează dubla verificare:</b> fiecare eveniment are un <code>eventId</code> stabil. Clientul îl emite
            spre <code>fbq('track', name, data, {'{'} eventID {'}'})</code> și <code>gtag('event', name, {'{'} _eid {'}'})</code>; backend-ul îl forwardează prin
            CAPI/Measurement Protocol cu același <code>event_id</code>. Meta și GA fac dedup — diferența vizibilă
            între „capturat intern" și „raportat de pixel" indică pierderi prin adblock sau JS error.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============== Reusable bits ==============

// ============== ADS & ROAS ==============

const money = (cents: number, currency?: string | null) => {
  const v = (cents / 100).toLocaleString('ro-RO', { maximumFractionDigits: 2 });
  return currency ? `${v} ${currency}` : v;
};

const PLATFORM_META: Record<'meta' | 'tiktok', { label: string; color: string }> = {
  meta: { label: 'Meta (Facebook/Instagram)', color: 'hsl(217 91% 65%)' },
  tiktok: { label: 'TikTok', color: 'hsl(330 80% 60%)' },
};

function AdsTab({ range }: { range: { from: string; to: string } }) {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const report = useAsync(() => AnalyticsApi.adSpend(range), [range, refreshKey]);
  const r = report.data;

  const onSync = async () => {
    setSyncing(true);
    try {
      const res = await AnalyticsApi.adSpendSync(7);
      const totalRows = res.results.reduce((a, x) => a + x.meta.rows + x.tiktok.rows, 0);
      const errs = res.results
        .flatMap((x) => [x.meta.error, x.tiktok.error])
        .filter(Boolean) as string[];
      toast({
        variant: errs.length ? 'destructive' : 'success',
        title: errs.length ? 'Sincronizare parțială' : 'Sincronizat',
        description: errs.length
          ? `Erori: ${errs.slice(0, 2).join(' · ')}`
          : `${totalRows} rânduri actualizate din Marketing API.`,
      });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Cheltuieli trase din Meta &amp; TikTok Marketing API, defalcate pe campanie. ROAS = venit ÷ cheltuială.
        </p>
        <Button variant="outline" size="sm" onClick={onSync} disabled={syncing}>
          <RefreshCw className={cn('mr-2 h-4 w-4', syncing && 'animate-spin')} />
          {syncing ? 'Se sincronizează…' : 'Sincronizează acum'}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Cheltuială totală"
          value={r ? money(r.totalSpendCents, r.platforms.find((p) => p.currency)?.currency) : undefined}
          icon={<Megaphone />}
          tone="destructive"
          loading={report.isLoading}
        />
        <KpiCard
          label="Revenue (Stripe)"
          value={r ? RON(r.revenueCents) : undefined}
          icon={<CircleDollarSign />}
          tone="success"
          loading={report.isLoading}
        />
        <KpiCard
          label="ROAS"
          value={r ? (r.roas != null ? `${r.roas.toFixed(2)}×` : '—') : undefined}
          sub={r?.roas != null ? (r.roas >= 1 ? 'profitabil' : 'sub pragul de rentabilitate') : undefined}
          icon={<Target />}
          tone={r && r.roas != null && r.roas >= 1 ? 'success' : 'primary'}
          loading={report.isLoading}
        />
        <KpiCard
          label="Cost / conversie"
          value={r ? (r.costPerConversion != null ? money(Math.round(r.costPerConversion), r.platforms.find((p) => p.currency)?.currency) : '—') : undefined}
          sub={r ? `${r.paidCount} plăți` : undefined}
          icon={<MousePointerClick />}
          tone="info"
          loading={report.isLoading}
        />
      </div>

      {r && r.totalSpendCents === 0 && !report.isLoading ? (
        <Empty
          title="Nicio cheltuială în interval"
          description={'Verifică că ai completat Ad Account ID + Marketing API token pe site (Setări site → Cheltuieli ads) și apasă „Sincronizează acum".'}
        />
      ) : null}

      {(['meta', 'tiktok'] as const).map((platform) => {
        const p = r?.platforms.find((x) => x.platform === platform);
        return (
          <PlatformBreakdown
            key={platform}
            platform={platform}
            data={p}
            loading={report.isLoading}
          />
        );
      })}
    </div>
  );
}

function PlatformBreakdown({
  platform,
  data,
  loading,
}: {
  platform: 'meta' | 'tiktok';
  data: AdSpendPlatform | undefined;
  loading: boolean;
}) {
  const meta = PLATFORM_META[platform];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
            {meta.label}
          </CardTitle>
          {data ? (
            <div className="text-right text-sm">
              <span className="font-semibold">{money(data.spendCents, data.currency)}</span>
              <span className="text-muted-foreground"> · {data.impressions.toLocaleString('ro-RO')} impresii · {data.clicks.toLocaleString('ro-RO')} clickuri</span>
            </div>
          ) : null}
        </div>
        {data?.fetchedAt ? (
          <CardDescription>
            Ultima sincronizare: {format(new Date(data.fetchedAt), 'd MMM HH:mm', { locale: ro })}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data || data.campaigns.length === 0 ? (
          <Empty title="Fără date" description="Nicio campanie cu cheltuieli în intervalul selectat." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanie</TableHead>
                <TableHead className="text-right">Cheltuială</TableHead>
                <TableHead className="text-right">Impresii</TableHead>
                <TableHead className="text-right">Clickuri</TableHead>
                <TableHead className="text-right">CPC</TableHead>
                <TableHead className="text-right">CPM</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.campaigns.map((c) => (
                <TableRow key={c.campaignId}>
                  <TableCell className="max-w-[280px] truncate" title={c.campaignName ?? c.campaignId}>
                    {c.campaignName ?? c.campaignId}
                  </TableCell>
                  <TableCell className="text-right font-medium">{money(c.spendCents, c.currency)}</TableCell>
                  <TableCell className="text-right">{c.impressions.toLocaleString('ro-RO')}</TableCell>
                  <TableCell className="text-right">{c.clicks.toLocaleString('ro-RO')}</TableCell>
                  <TableCell className="text-right">{c.cpc != null ? money(Math.round(c.cpc), c.currency) : '—'}</TableCell>
                  <TableCell className="text-right">{c.cpm != null ? money(Math.round(c.cpm), c.currency) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function KpiCard({
  label,
  value,
  sub,
  trend,
  icon,
  tone = 'default',
  loading,
}: {
  label: string;
  value: number | string | undefined;
  sub?: string;
  trend?: { value: number; up: boolean } | null;
  icon?: React.ReactNode;
  tone?: 'default' | 'primary' | 'success' | 'destructive' | 'warning' | 'info';
  loading?: boolean;
}) {
  const iconBg = {
    default: 'bg-secondary text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    destructive: 'bg-destructive/10 text-destructive',
    warning: 'bg-warning/10 text-warning',
    info: 'bg-info/10 text-info',
  }[tone];
  return (
    <Card className="surface">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {loading ? <Skeleton className="h-7 w-20" /> : value !== undefined ? value : '—'}
            </div>
            {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
            {trend && (
              <div
                className={cn(
                  'mt-1 inline-flex items-center gap-0.5 text-xs font-medium',
                  trend.up ? 'text-success' : 'text-destructive',
                )}
              >
                {trend.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {trend.value}% vs perioada anterioară
              </div>
            )}
          </div>
          {icon && (
            <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg [&_svg]:h-4 [&_svg]:w-4', iconBg)}>
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ReconStat({ label, value, tone }: { label: string; value: number; tone: 'success' | 'destructive' | 'warning' }) {
  const cls = {
    success: 'text-success',
    destructive: 'text-destructive',
    warning: 'text-warning',
  }[tone];
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className={cn('mt-1 text-xl font-semibold tabular-nums', cls)}>{value}</div>
    </div>
  );
}

function ReconBadge({ status }: { status: string }) {
  const map: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    matched: { variant: 'success', label: 'Matched' },
    missing_local: { variant: 'destructive', label: 'Lipsă local' },
    missing_stripe: { variant: 'warning', label: 'Lipsă Stripe' },
    amount_mismatch: { variant: 'warning', label: 'Sumă diferită' },
  };
  const m = map[status] ?? { variant: 'muted' as const, label: status };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

const chartTooltipStyle: React.CSSProperties = {
  background: 'hsl(220 22% 9%)',
  border: '1px solid hsl(220 17% 16%)',
  borderRadius: 8,
  fontSize: 12,
  color: 'hsl(220 13% 91%)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
};

// ============== SESSIONS DRILL-DOWN TAB ==============

function SessionsTab({ range }: { range: { from: string; to: string } }) {
  const [filters, setFilters] = useState<{ country?: string; browser?: string; device?: string; category?: string; excludeBots?: boolean }>({ excludeBots: true });
  const [selected, setSelected] = useState<string | null>(null);

  const { data, loading } = useAsync(
    () => AnalyticsApi.recentSessions(range, { limit: 100, ...filters }),
    [range.from, range.to, filters.country, filters.browser, filters.device, filters.category, filters.excludeBots],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sesiuni recente</CardTitle>
          <CardDescription>
            Drill-down individual: IP, geo, browser, OS, device, referrer, UTM, viewport, conexiune.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            {(['country', 'browser', 'device'] as const).map((k) => (
              <input
                key={k}
                placeholder={k}
                value={filters[k] ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, [k]: e.target.value || undefined }))
                }
                className="rounded border border-white/10 bg-transparent px-2 py-1"
              />
            ))}
            <select
              value={filters.category ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value || undefined }))}
              className="rounded border border-white/10 bg-transparent px-2 py-1"
            >
              <option value="">— categorie —</option>
              <option value="human">human</option>
              <option value="suspicious">suspicious</option>
              <option value="datacenter">datacenter</option>
              <option value="headless">headless</option>
              <option value="known_bot">known_bot</option>
            </select>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={!!filters.excludeBots}
                onChange={(e) => setFilters((f) => ({ ...f, excludeBots: e.target.checked }))}
              />
              Exclude bots (score≥70)
            </label>
            {(filters.country || filters.browser || filters.device || filters.category) && (
              <button
                onClick={() => setFilters({ excludeBots: filters.excludeBots })}
                className="rounded border border-white/10 px-2 py-1 hover:bg-white/5"
              >
                Reset
              </button>
            )}
          </div>
          {loading ? (
            <Skeleton className="h-72 w-full" />
          ) : !data || data.items.length === 0 ? (
            <Empty title="Nicio sesiune în interval" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Început</TableHead>
                    <TableHead>Geo</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Browser</TableHead>
                    <TableHead>OS</TableHead>
                    <TableHead>Sursă</TableHead>
                    <TableHead>Bot</TableHead>
                    <TableHead className="text-right">Pages</TableHead>
                    <TableHead className="text-right">Durată</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((s) => (
                    <TableRow
                      key={s.sessionKey}
                      className="cursor-pointer hover:bg-white/5"
                      onClick={() => setSelected(s.sessionKey)}
                    >
                      <TableCell className="whitespace-nowrap text-xs">
                        {format(new Date(s.startedAt), "d MMM HH:mm", { locale: ro })}
                      </TableCell>
                      <TableCell className="text-xs">
                        {s.country ? (
                          <span title={[s.countryName, s.region, s.city].filter(Boolean).join(', ')}>
                            {s.country} · {s.city ?? '—'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{s.ip ?? '—'}</TableCell>
                      <TableCell className="text-xs">
                        {s.device}
                        {s.deviceModel ? ` (${s.deviceModel})` : ''}
                        {s.isBot && (
                          <Badge variant="warning" className="ml-1 text-[10px]">
                            bot
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {s.browserName ?? '—'} {s.browserVersion ?? ''}
                      </TableCell>
                      <TableCell className="text-xs">
                        {s.osName ?? '—'} {s.osVersion ?? ''}
                      </TableCell>
                      <TableCell className="text-xs">
                        {s.source ?? 'direct'}
                        {s.medium ? ` / ${s.medium}` : ''}
                      </TableCell>
                      <TableCell className="text-xs">
                        <BotBadge score={s.botScore} category={s.botCategory} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{s.pageViews}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {fmtDuration(s.durationSec)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-2 text-xs text-muted-foreground">
                {data.items.length} din {data.total} sesiuni
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {selected && <SessionDetailDrawer sessionKey={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function SessionDetailDrawer({
  sessionKey,
  onClose,
}: {
  sessionKey: string;
  onClose: () => void;
}) {
  const { data, loading } = useAsync(() => AnalyticsApi.sessionDetail(sessionKey), [sessionKey]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[hsl(220_22%_9%)] p-5 text-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Sesiune {sessionKey.slice(0, 8)}…</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-white">
            ✕
          </button>
        </div>
        {loading ? (
          <Skeleton className="h-96 w-full" />
        ) : !data ? (
          <Empty title="Eroare" />
        ) : (
          <div className="space-y-4">
            <SessionInfoBlock s={data.session as unknown as Record<string, unknown>} />
            {Array.isArray((data.session as unknown as { botReasons?: unknown }).botReasons) &&
              ((data.session as unknown as { botReasons: Array<{ rule: string; weight: number; detail?: string }> }).botReasons.length > 0) && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                    Bot detection — reguli declanșate
                  </h4>
                  <div className="space-y-1 text-xs">
                    {(data.session as unknown as { botReasons: Array<{ rule: string; weight: number; detail?: string }> }).botReasons.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-2 py-1"
                      >
                        <span className="font-mono">{r.rule}</span>
                        <span className="text-muted-foreground">
                          +{r.weight}
                          {r.detail ? ` · ${r.detail}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                Evenimente ({data.events.length})
              </h4>
              <div className="space-y-1 font-mono text-xs">
                {data.events.map((e) => (
                  <div
                    key={e.id}
                    className="rounded border border-white/5 bg-white/[0.02] px-2 py-1"
                  >
                    <span className="text-muted-foreground">
                      {format(new Date(e.createdAt), 'HH:mm:ss')}
                    </span>{' '}
                    <span className="font-semibold text-yellow-200">{e.type}</span>{' '}
                    {e.path && <span className="text-muted-foreground">{e.path}</span>}
                    {e.valueCents != null && (
                      <span className="ml-1 text-emerald-300">
                        {(e.valueCents / 100).toFixed(2)} {e.currency ?? 'RON'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SessionInfoBlock({ s }: { s: { [k: string]: unknown } }) {
  const rows: Array<[string, unknown]> = [
    ['Visitor ID', s.visitorId],
    ['User ID', s.userId],
    ['Guest ID', s.guestId],
    ['IP', s.ip],
    ['Țară', `${s.countryName ?? s.country ?? '—'}`],
    ['Regiune / oraș', [s.region, s.city].filter(Boolean).join(', ') || '—'],
    ['ISP', s.isp],
    ['Browser', `${s.browserName ?? '—'} ${s.browserVersion ?? ''}`],
    ['OS', `${s.osName ?? '—'} ${s.osVersion ?? ''}`],
    ['Device', `${s.device ?? '—'}${s.deviceModel ? ` (${s.deviceModel})` : ''}`],
    ['Viewport', s.viewportWidth ? `${s.viewportWidth} × ${s.viewportHeight}` : '—'],
    ['Screen', s.screenWidth ? `${s.screenWidth} × ${s.screenHeight}` : '—'],
    ['Limbă', s.language],
    ['Timezone', s.timezone],
    ['Conexiune', s.connectionType],
    ['Referrer', s.referrer],
    ['Sursă', `${s.source ?? 'direct'}${s.medium ? ` / ${s.medium}` : ''}`],
    ['Campanie', s.campaign],
    ['Landing', s.landingPath],
    ['Exit', s.exitPath],
    ['Page views', s.pageViews],
    ['Durată', `${s.durationSec}s`],
    ['Bounce', s.bounced ? 'Da' : 'Nu'],
    ['Consent', s.consentGiven ? '✓' : '—'],
    ['DNT', s.doNotTrack ? '✓' : '—'],
    ['Bot', s.isBot ? '✓' : '—'],
  ];
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between border-b border-white/5 py-1">
          <span className="text-muted-foreground">{k}</span>
          <span className="text-right font-mono">
            {v == null || v === '' ? '—' : String(v).slice(0, 60)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============== TECH & GEOGRAPHY TAB ==============

function TechTab({ range }: { range: { from: string; to: string } }) {
  const { data: countries, loading: lc } = useAsync(() => AnalyticsApi.countries(range), [range.from, range.to]);
  const { data: browsers, loading: lb } = useAsync(() => AnalyticsApi.browsers(range), [range.from, range.to]);
  const { data: oss, loading: los } = useAsync(() => AnalyticsApi.os(range), [range.from, range.to]);
  const { data: screens, loading: ls } = useAsync(() => AnalyticsApi.screens(range), [range.from, range.to]);
  const { data: langs, loading: ll } = useAsync(() => AnalyticsApi.languages(range), [range.from, range.to]);
  const { data: vitals, loading: lv } = useAsync(() => AnalyticsApi.webVitals(range), [range.from, range.to]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <BreakdownCard
        title="Țări"
        description="Top 20 după sesiuni (geo din IP)"
        loading={lc}
        rows={(countries ?? []).map((c) => ({
          label: c.countryName ? `${c.country} · ${c.countryName}` : c.country,
          value: c.sessions,
          extra: `${c.visitors} vizitatori`,
        }))}
      />
      <BreakdownCard
        title="Browsere"
        loading={lb}
        rows={(browsers ?? []).map((b) => ({ label: b.browser, value: b.sessions }))}
      />
      <BreakdownCard
        title="Sisteme de operare"
        loading={los}
        rows={(oss ?? []).map((o) => ({ label: o.os, value: o.sessions }))}
      />
      <BreakdownCard
        title="Lățime viewport"
        loading={ls}
        rows={(screens ?? []).map((s) => ({ label: s.bucket, value: s.sessions }))}
      />
      <BreakdownCard
        title="Limbă browser"
        loading={ll}
        rows={(langs ?? []).map((l) => ({ label: l.language, value: l.sessions }))}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Core Web Vitals</CardTitle>
          <CardDescription>Performanță percepută (LCP, FID, CLS, FCP, TTFB)</CardDescription>
        </CardHeader>
        <CardContent>
          {lv ? (
            <Skeleton className="h-40 w-full" />
          ) : !vitals || vitals.length === 0 ? (
            <Empty title="Niciun sample în interval" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead className="text-right">Avg</TableHead>
                  <TableHead className="text-right">p75</TableHead>
                  <TableHead className="text-right">p95</TableHead>
                  <TableHead className="text-right">Samples</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vitals.map((v) => (
                  <TableRow key={v.metric}>
                    <TableCell className="font-mono text-xs">{v.metric}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.avg}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.p75}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.p95}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                      {v.samples}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BotBadge({ score, category }: { score: number; category: string }) {
  let variant: BadgeProps['variant'] = 'success';
  if (score >= 70) variant = 'destructive';
  else if (score >= 40) variant = 'warning';
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={variant} className="text-[10px]">
        {category}
      </Badge>
      <span className="font-mono text-[10px] text-muted-foreground">{score}</span>
    </span>
  );
}

function BotsTab({ range }: { range: { from: string; to: string } }) {
  const { data, loading } = useAsync(() => AnalyticsApi.botStats(range), [range.from, range.to]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <BotKpi title="Sesiuni totale" value={data?.total ?? 0} loading={loading} />
        <BotKpi
          title="Bots (score≥70)"
          value={data?.bots ?? 0}
          extra={data ? `${data.botRate}%` : ''}
          loading={loading}
          variant="destructive"
        />
        <BotKpi title="Suspicious" value={data?.suspicious ?? 0} loading={loading} variant="warning" />
        <BotKpi title="Humans" value={data?.humans ?? 0} loading={loading} variant="success" />
        <BotKpi title="Avg score" value={data?.avgScore ?? 0} loading={loading} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribuție pe categorii</CardTitle>
            <CardDescription>human / suspicious / datacenter / headless / known_bot</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : (data?.byCategory.length ?? 0) === 0 ? (
              <Empty title="Fără date" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={data!.byCategory}
                    dataKey="sessions"
                    nameKey="category"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {data!.byCategory.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <ReTooltip contentStyle={chartTooltipStyle} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top reguli declanșate</CardTitle>
            <CardDescription>Care semnale au capturat cei mai mulți boți</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : (data?.topRules.length ?? 0) === 0 ? (
              <Empty title="Niciun bot detectat" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Regulă</TableHead>
                    <TableHead className="text-right">Hits</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.topRules.map((r) => (
                    <TableRow key={r.rule}>
                      <TableCell className="font-mono text-xs">{r.rule}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.hits}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BotKpi({
  title,
  value,
  extra,
  loading,
  variant,
}: {
  title: string;
  value: number | string;
  extra?: string;
  loading: boolean;
  variant?: 'success' | 'warning' | 'destructive';
}) {
  const colors: Record<string, string> = {
    success: 'text-emerald-300',
    warning: 'text-amber-300',
    destructive: 'text-red-300',
  };
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs uppercase">{title}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className={cn('text-2xl font-semibold tabular-nums', variant ? colors[variant] : '')}>
            {typeof value === 'number' ? value.toLocaleString('ro-RO') : value}
            {extra && <span className="ml-2 text-sm text-muted-foreground">({extra})</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BreakdownCard({
  title,
  description,
  loading,
  rows,
}: {
  title: string;
  description?: string;
  loading: boolean;
  rows: Array<{ label: string; value: number; extra?: string }>;
}) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : rows.length === 0 ? (
          <Empty title="Fără date" />
        ) : (
          <div className="space-y-1.5">
            {rows.slice(0, 12).map((r) => {
              const pct = total > 0 ? Math.round((r.value / total) * 1000) / 10 : 0;
              return (
                <div key={r.label} className="text-xs">
                  <div className="flex justify-between">
                    <span className="truncate">{r.label || '—'}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {r.value.toLocaleString('ro-RO')} ({pct}%)
                      {r.extra ? ` · ${r.extra}` : ''}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded bg-white/5">
                    <div
                      className="h-full bg-yellow-400/70"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
