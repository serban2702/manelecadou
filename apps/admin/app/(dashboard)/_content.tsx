'use client';

import { useEffect, useMemo, useState } from 'react';
import { endOfDay, format, startOfDay } from 'date-fns';
import { ro } from 'date-fns/locale';
import {
  Activity,
  CheckCircle2,
  CircleDollarSign,
  Coins,
  CreditCard,
  Eye,
  Loader2,
  Megaphone,
  MousePointerClick,
  Music2,
  PiggyBank,
  Receipt,
  TrendingUp,
  Unlock,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AdminApi, AnalyticsApi, type ProfitReport } from '@/lib/api';
import { useAsync } from '@/lib/hooks/use-async';
import { useSitesMap } from '@/lib/hooks/use-sites-map';
import { cn } from '@/lib/cn';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DateRangePicker, DATA_EPOCH, type DateRangeValue } from '@/components/ui/date-range-picker';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';

const RON = (cents: number) =>
  `${(cents / 100).toLocaleString('ro-RO', { maximumFractionDigits: 2 })} lei`;

const PIE_COLORS = ['hsl(45 84% 62%)', 'hsl(217 91% 65%)', 'hsl(158 64% 52%)', 'hsl(38 92% 60%)', 'hsl(0 72% 56%)', 'hsl(280 65% 60%)'];

const chartTooltipStyle = {
  backgroundColor: 'hsl(20 14% 8%)',
  border: '1px solid hsl(30 10% 20%)',
  borderRadius: 8,
  fontSize: 12,
} as const;

const RANGE_STORAGE_KEY = 'mc_admin_dashboard_range';

/** Restaurăm ultima perioadă selectată (persistată în localStorage). */
function loadStoredRange(): DateRangeValue | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(RANGE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { from?: string; to?: string };
    if (!parsed.from || !parsed.to) return null;
    const from = new Date(parsed.from);
    const to = new Date(parsed.to);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) return null;
    return { from, to };
  } catch {
    return null;
  }
}

export default function AdminDashboard() {
  // Default: TOT istoricul de date reale (din 25 mai 2026) — cerință 2026-07-07.
  const [range, setRange] = useState<DateRangeValue>(
    () =>
      loadStoredRange() ?? {
        from: startOfDay(DATA_EPOCH),
        to: endOfDay(new Date()),
      },
  );
  useEffect(() => {
    try {
      window.localStorage.setItem(
        RANGE_STORAGE_KEY,
        JSON.stringify({ from: range.from.toISOString(), to: range.to.toISOString() }),
      );
    } catch {/* ignore */}
  }, [range]);

  const rangeISO = useMemo(
    () => ({ from: range.from.toISOString(), to: range.to.toISOString() }),
    [range],
  );
  const days = useMemo(
    () => ({ fromDay: format(range.from, 'yyyy-MM-dd'), toDay: format(range.to, 'yyyy-MM-dd') }),
    [range],
  );

  const { data: stats, loading: statsLoading } = useAsync(
    () => AdminApi.statsRange(rangeISO),
    [rangeISO.from, rangeISO.to],
    { refetchInterval: 60_000 },
  );
  const { data: profit, loading: profitLoading } = useAsync(
    () => AnalyticsApi.profitability(rangeISO, days),
    [rangeISO.from, rangeISO.to],
    { refetchInterval: 120_000 },
  );
  const { data: mkt } = useAsync(
    () => AnalyticsApi.marketingSummary(rangeISO),
    [rangeISO.from, rangeISO.to],
    { refetchInterval: 120_000 },
  );

  const { byId: sitesById, isAllSelected } = useSitesMap();

  const series = useMemo(
    () =>
      (stats?.series ?? []).map((s) => ({
        ...s,
        label: format(new Date(s.day + 'T00:00:00'), 'd MMM', { locale: ro }),
        revenueLei: Math.round(s.revenueRonCents / 100),
      })),
    [stats],
  );

  const bySiteData = useMemo(
    () =>
      (stats?.bySite ?? [])
        .filter((r) => r.revenueRonCents > 0 || r.orders > 0)
        .map((r) => ({
          name: r.siteId ? sitesById.get(r.siteId)?.name ?? r.siteId.slice(0, 8) : 'Fără site',
          revenueLei: Math.round(r.revenueRonCents / 100),
          orders: r.orders,
        })),
    [stats, sitesById],
  );

  // Seria zilnică venituri vs cheltuieli vs profit (business-wide, din raportul
  // de profitabilitate — aceleași componente ca în cardul „Profitabilitate").
  const profitSeries = useMemo(
    () =>
      (profit?.daily ?? []).map((d) => ({
        label: format(new Date(d.day + 'T00:00:00'), 'd MMM', { locale: ro }),
        venit: Math.round(d.revenueRonCents / 100),
        cheltuieli: Math.round(d.expensesRonCents / 100),
        profit: Math.round(d.profitRonCents / 100),
      })),
    [profit],
  );

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Vânzări, generări și profitabilitate · datele încep pe 25 mai 2026"
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />

      {/* ===== KPI principale ===== */}
      {statsLoading && !stats ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <Stat
              label="Venit (perioadă)"
              value={RON(stats.revenue.totalRonCents)}
              icon={<CircleDollarSign />}
              tone="success"
              big
              sub={`${stats.revenue.paidCount} comenzi plătite`}
            />
            <Stat
              label="Profit"
              value={profit ? RON(profit.profitRonCents) : '…'}
              icon={<PiggyBank />}
              tone={profit && profit.profitRonCents < 0 ? 'destructive' : 'primary'}
              big
              sub={profit ? `marjă ${profit.marginPct}% · toate site-urile` : 'se calculează'}
            />
            <Stat
              label="Valoare medie comandă"
              value={RON(stats.revenue.aovRonCents)}
              icon={<TrendingUp />}
              tone="info"
              big
              sub={`${stats.revenue.failedCount} plăți eșuate · ${stats.revenue.refundedCount} refund`}
            />
            <Stat
              label="Conversie demo → paid"
              value={`${stats.conversionRate}%`}
              icon={<Activity />}
              tone="info"
              big
              sub={`${stats.generations.paidUnlocked} unlocks din ${stats.generations.demos} demo`}
            />
          </div>

          {/* ===== KPI secundare ===== */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4 mb-5">
            <Stat label="Sesiuni" value={mkt?.sessions ?? '…'} icon={<Eye />} />
            <Stat label="Vizitatori" value={mkt?.visitors ?? '…'} icon={<Users />} />
            <Stat
              label="Conv. vizitator"
              value={mkt ? `${mkt.visitorConv.toLocaleString('ro-RO', { maximumFractionDigits: 2 })}%` : '…'}
              icon={<MousePointerClick />}
            />
            <Stat label="Checkout inițiat" value={mkt?.checkoutsInitiated ?? '…'} icon={<CreditCard />} />
            <Stat label="Generări" value={stats.generations.total} icon={<Music2 />} sub={`${stats.generations.running} în lucru`} />
            <Stat label="Reușite" value={stats.generations.succeeded} icon={<CheckCircle2 />} tone="success" />
            <Stat label="Eșuate" value={stats.generations.failed} icon={<XCircle />} tone={stats.generations.failed > 0 ? 'destructive' : 'default'} />
            <Stat label="Unlocked" value={stats.generations.paidUnlocked} icon={<Unlock />} tone="success" />
          </div>

          {/* ===== Grafice: venit/comenzi + venit per site ===== */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
            <Card className="surface xl:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Venit & comenzi pe zi</CardTitle>
                <CardDescription>Sume normalizate în RON · fără plățile de test ale echipei</CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                {series.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={series} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="dashRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(45 84% 62%)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="hsl(45 84% 62%)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(30 10% 18%)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(30 8% 50%)" minTickGap={24} />
                      <YAxis yAxisId="lei" tick={{ fontSize: 11 }} stroke="hsl(30 8% 50%)" width={56}
                        tickFormatter={(v: number) => `${v.toLocaleString('ro-RO')}`} />
                      <YAxis yAxisId="orders" orientation="right" tick={{ fontSize: 11 }} stroke="hsl(30 8% 50%)" width={30} allowDecimals={false} />
                      <ReTooltip
                        contentStyle={chartTooltipStyle}
                        formatter={(v, name) =>
                          name === 'Venit (lei)' ? [`${Number(v).toLocaleString('ro-RO')} lei`, name] : [v, name]
                        }
                      />
                      <Area yAxisId="lei" type="monotone" dataKey="revenueLei" name="Venit (lei)"
                        stroke="hsl(45 84% 62%)" strokeWidth={2} fill="url(#dashRevenue)" />
                      <Bar yAxisId="orders" dataKey="orders" name="Comenzi" fill="hsl(217 91% 65%)"
                        radius={[3, 3, 0, 0]} maxBarSize={18} opacity={0.85} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="surface">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  {isAllSelected ? 'Venit per site' : 'Venituri vs cheltuieli pe zi'}
                </CardTitle>
                <CardDescription>
                  {isAllSelected
                    ? 'Distribuția vânzărilor pe tenant'
                    : 'Business-wide (toate site-urile) · aceleași componente ca la Profitabilitate'}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                {isAllSelected ? (
                  bySiteData.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie data={bySiteData} dataKey="revenueLei" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                            {bySiteData.map((_, i) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="transparent" />
                            ))}
                          </Pie>
                          <ReTooltip
                            contentStyle={chartTooltipStyle}
                            formatter={(v, name) => [`${Number(v).toLocaleString('ro-RO')} lei`, name]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="mt-2 space-y-1.5">
                        {bySiteData.map((s, i) => (
                          <div key={s.name} className="flex items-center gap-2 text-xs">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="flex-1 truncate text-muted-foreground">{s.name}</span>
                            <span className="tabular-nums font-medium">{s.revenueLei.toLocaleString('ro-RO')} lei</span>
                            <span className="tabular-nums text-muted-foreground w-14 text-right">{s.orders} com.</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )
                ) : profitSeries.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ProfitDailyChart data={profitSeries} height={280} />
                )}
              </CardContent>
            </Card>
          </div>

          {/* ===== Venituri vs cheltuieli pe zi (doar în scope all — altfel e în cardul de sus) ===== */}
          {isAllSelected && profitSeries.length > 0 && (
            <Card className="surface mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Venituri vs cheltuieli pe zi</CardTitle>
                <CardDescription>
                  Cheltuieli = Meta + Suno + recurente pro-rata + TVA + impozit micro + Stripe · aceleași componente ca la Profitabilitate
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                <ProfitDailyChart data={profitSeries} height={240} />
              </CardContent>
            </Card>
          )}

          {/* ===== Profitabilitate ===== */}
          <ProfitCard profit={profit ?? null} loading={profitLoading} isAllSelected={isAllSelected} />
        </>
      ) : null}
    </div>
  );
}

/** Cardul de profitabilitate: venit − cheltuieli defalcate = profit. */
function ProfitCard({
  profit,
  loading,
  isAllSelected,
}: {
  profit: ProfitReport | null;
  loading: boolean;
  isAllSelected: boolean;
}) {
  if (loading && !profit) return <Skeleton className="h-64 w-full" />;
  if (!profit) return null;

  const expenseLines: Array<{ label: string; cents: number; icon: React.ReactNode; hint?: string }> = [
    { label: 'Meta Ads', cents: profit.meta.ronCents, icon: <Megaphone className="h-3.5 w-3.5" /> },
    {
      label: 'Suno API',
      cents: profit.suno.ronCents,
      icon: <Music2 className="h-3.5 w-3.5" />,
      hint: `${profit.suno.requests} requesturi × ${profit.suno.usdPerRequest}$`,
    },
    {
      label: 'Recurente (servere, tools)',
      cents: profit.recurringTotalRonCents,
      icon: <Coins className="h-3.5 w-3.5" />,
      hint: profit.recurring.map((r) => r.label).join(', '),
    },
    { label: `TVA ${profit.vatRatePct}%`, cents: profit.vatRonCents, icon: <Receipt className="h-3.5 w-3.5" /> },
    { label: `Impozit micro ${profit.microTaxRatePct}%`, cents: profit.microTaxRonCents, icon: <Receipt className="h-3.5 w-3.5" /> },
    {
      label: 'Comision Stripe',
      cents: profit.stripeFee.ronCents,
      icon: <CreditCard className="h-3.5 w-3.5" />,
      hint: `${profit.stripeFee.paymentsKnown}/${profit.stripeFee.paymentsTotal} plăți cu fee cunoscut`,
    },
  ];
  const maxExpense = Math.max(1, ...expenseLines.map((e) => e.cents));
  const negative = profit.profitRonCents < 0;

  return (
    <Card className="surface">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" /> Profitabilitate
        </CardTitle>
        <CardDescription>
          {profit.range.fromDay} → {profit.range.toDay} · {profit.range.days} zile
          {!isAllSelected && ' · calcul business-wide (toate site-urile)'}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sumar mare */}
          <div className="space-y-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Venituri</div>
              <div className="text-2xl font-semibold tabular-nums text-success">{RON(profit.revenueRonCents)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Cheltuieli totale</div>
              <div className="text-2xl font-semibold tabular-nums text-destructive">−{RON(profit.totalExpensesRonCents)}</div>
            </div>
            <div className="pt-2 border-t border-border">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Profit net</div>
              <div className={cn('text-3xl font-bold tabular-nums', negative ? 'text-destructive' : 'text-primary')}>
                {RON(profit.profitRonCents)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                marjă <span className={cn('font-semibold', negative ? 'text-destructive' : 'text-primary')}>{profit.marginPct}%</span>
                {' '}· {profit.range.days > 0 && profit.profitRonCents !== 0
                  ? `~${RON(Math.round(profit.profitRonCents / Math.max(1, profit.range.days)))}/zi`
                  : '—'}
              </div>
            </div>
          </div>

          {/* Breakdown cheltuieli */}
          <div className="lg:col-span-2 space-y-2.5">
            {expenseLines.map((e) => (
              <div key={e.label}>
                <div className="flex items-center gap-2 text-xs mb-1">
                  <span className="text-muted-foreground">{e.icon}</span>
                  <span className="flex-1 truncate">
                    {e.label}
                    {e.hint && <span className="text-muted-foreground"> · {e.hint}</span>}
                  </span>
                  <span className="tabular-nums font-medium">{RON(e.cents)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-destructive/70 to-destructive rounded-full"
                    style={{ width: `${Math.max(1, Math.round((e.cents / maxExpense) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
            {!profit.stripeConfigured && (
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-1">
                <Loader2 className="h-3 w-3" /> Stripe nu e configurat — comisioanele pot fi incomplete.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Grafic zilnic venituri (verde) vs cheltuieli (roșu) + linia de profit (auriu).
 * Culorile urmează semantica din cardul Profitabilitate (success/destructive/
 * primary); legenda e obligatorie — identitatea seriilor nu stă doar în culoare.
 */
function ProfitDailyChart({
  data,
  height = 240,
}: {
  data: Array<{ label: string; venit: number; cheltuieli: number; profit: number }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(30 10% 18%)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(30 8% 50%)" minTickGap={24} />
        <YAxis
          tick={{ fontSize: 11 }}
          stroke="hsl(30 8% 50%)"
          width={48}
          tickFormatter={(v: number) => v.toLocaleString('ro-RO')}
        />
        <ReTooltip
          contentStyle={chartTooltipStyle}
          formatter={(v, name) => [`${Number(v).toLocaleString('ro-RO')} lei`, name]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
        <ReferenceLine y={0} stroke="hsl(30 10% 30%)" />
        <Bar dataKey="venit" name="Venit" fill="hsl(158 64% 52%)" radius={[3, 3, 0, 0]} maxBarSize={14} />
        <Bar dataKey="cheltuieli" name="Cheltuieli" fill="hsl(0 72% 56%)" radius={[3, 3, 0, 0]} maxBarSize={14} />
        <Line type="monotone" dataKey="profit" name="Profit" stroke="hsl(45 84% 62%)" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function EmptyChart() {
  return (
    <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
      Fără date pe perioada selectată
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
              {typeof value === 'number' ? value.toLocaleString('ro-RO') : value}
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
