'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useAsync } from "@/lib/hooks/use-async";
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { ro } from 'date-fns/locale';
import {
  Activity,
  Download,
  Image as ImageIcon,
  Play,
  Share2,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Coins,
  CreditCard,
  Eye,
  Globe,
  Landmark,
  Megaphone,
  MousePointerClick,
  Pencil,
  Percent,
  PiggyBank,
  Plus,
  Receipt,
  RefreshCw,
  Save,
  Smartphone,
  Target,
  Timer,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserCircle2,
  Users,
  Wallet,
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
import {
  AnalyticsApi,
  type AdSpendPlatform,
  type AdPayment,
  type AdPaymentInput,
  type AdPaymentType,
  type AdPaymentReconciliation,
  type MarketingDimension,
  type MarketingBreakdownRow,
  type MarketingSummary,
  type ProfitReport,
  type ProfitConfigData,
  type ProfitExpenseItem,
} from '@/lib/api';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TabsContent } from '@/components/ui/tabs';
import { ResponsiveTabs } from '@/components/ui/responsive-tabs';

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

const RANGE_STORAGE_KEY = 'mc_admin_analytics_range';

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

export default function AnalyticsPage() {
  const [range, setRange] = useState<DateRangeValue>(
    () =>
      loadStoredRange() ?? {
        from: startOfDay(subDays(new Date(), 6)),
        to: endOfDay(new Date()),
      },
  );
  // Reținem perioada aleasă pentru următoarele vizite pe pagina de analytics.
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
  // Tab implicit: Ads & ROAS (cel mai folosit pentru deciziile de buget).
  const [tab, setTab] = useState('ads');

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Sesiuni, conversii, revenue · cross-check Stripe + Pixel/GA4"
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />

      <ResponsiveTabs
        value={tab}
        onValueChange={setTab}
        listClassName="mb-5 max-w-full overflow-x-auto"
        tabs={[
          { value: 'ads', label: 'Ads & ROAS' },
          { value: 'profitability', label: 'Profitabilitate' },
          { value: 'marketing', label: 'Marketing' },
          { value: 'overview', label: 'Overview' },
          { value: 'engagement', label: 'Engagement' },
          { value: 'users', label: 'Users & Sesiuni' },
          { value: 'tech', label: 'Tech & Geo' },
          { value: 'bots', label: 'Boți' },
          { value: 'payments', label: 'Payments' },
          { value: 'cross-check', label: 'Cross-check' },
        ]}
      >
        <TabsContent value="ads">
          <AdsTab range={rangeISO} />
        </TabsContent>
        <TabsContent value="profitability">
          <ProfitabilityTab range={rangeISO} />
        </TabsContent>
        <TabsContent value="marketing">
          <MarketingTab range={rangeISO} />
        </TabsContent>
        <TabsContent value="overview">
          <OverviewTab range={rangeISO} />
        </TabsContent>
        <TabsContent value="engagement">
          <EngagementTab range={rangeISO} />
        </TabsContent>
        <TabsContent value="users">
          <UsersSessionsTab range={rangeISO} />
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
        <TabsContent value="cross-check">
          <CrossCheckTab range={rangeISO} />
        </TabsContent>
      </ResponsiveTabs>
    </div>
  );
}

// ============== MARKETING (plăți × trafic × conversie) ==============

/** Dimensiunile disponibile pentru matrice, grupate. */
const MKT_DIMENSIONS: Array<{ group: string; items: Array<{ value: MarketingDimension; label: string }> }> = [
  {
    group: 'Trafic',
    items: [
      { value: 'source', label: 'Sursă' },
      { value: 'medium', label: 'Medium' },
      { value: 'campaign', label: 'Campanie' },
      { value: 'device', label: 'Device' },
      { value: 'os', label: 'OS' },
      { value: 'browser', label: 'Browser' },
      { value: 'country', label: 'Țară' },
      { value: 'landing', label: 'Landing' },
    ],
  },
  {
    group: 'Temporal',
    items: [
      { value: 'day', label: 'Pe zile' },
      { value: 'hour', label: 'Oră din zi' },
      { value: 'dow', label: 'Zi săptămână' },
    ],
  },
  {
    group: 'Comandă',
    items: [
      { value: 'buyerGender', label: 'Gen cumpărător' },
      { value: 'voiceGender', label: 'Gen voce' },
      { value: 'package', label: 'Pachet' },
      { value: 'occasion', label: 'Ocazie' },
    ],
  },
];

type MktColKind = 'num' | 'money' | 'pct';
const MKT_COLUMNS: Array<{
  key: keyof MarketingBreakdownRow;
  label: string;
  kind: MktColKind;
  trafficOnly?: boolean;
  hint?: string;
}> = [
  { key: 'sessions', label: 'Sesiuni', kind: 'num', trafficOnly: true },
  { key: 'visitors', label: 'Vizitatori', kind: 'num', trafficOnly: true },
  { key: 'initiated', label: 'Checkout init.', kind: 'num', hint: 'Plăți inițiate (orice status)' },
  { key: 'purchases', label: 'Cumpărări', kind: 'num', hint: 'Plăți finalizate (paid)' },
  { key: 'failed', label: 'Eșuate', kind: 'num' },
  { key: 'revenueRon', label: 'Venit', kind: 'money' },
  { key: 'aov', label: 'AOV', kind: 'money', hint: 'Valoare medie comandă' },
  { key: 'visitorConv', label: 'Conv. vizitator', kind: 'pct', trafficOnly: true, hint: 'Cumpărări / sesiuni' },
  { key: 'checkoutConv', label: 'Finalizare', kind: 'pct', hint: 'Cumpărări / checkout inițiat' },
];

function fmtCell(v: number | null, kind: MktColKind): string {
  if (v == null) return '—';
  if (kind === 'money') return RON(v);
  if (kind === 'pct') return `${v.toLocaleString('ro-RO', { maximumFractionDigits: 1 })}%`;
  return v.toLocaleString('ro-RO');
}

function MarketingTab({ range }: { range: { from: string; to: string } }) {
  const { toast } = useToast();
  const [excludeBots, setExcludeBots] = useState(true);
  const [excludeTests, setExcludeTests] = useState(true);
  const [dim, setDim] = useState<MarketingDimension>('source');
  const [sortBy, setSortBy] = useState<keyof MarketingBreakdownRow | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [backfilling, setBackfilling] = useState(false);

  const summary = useAsync<MarketingSummary>(
    () => AnalyticsApi.marketingSummary(range, excludeBots, excludeTests),
    [range, excludeBots, excludeTests],
  );
  const breakdown = useAsync(
    () => AnalyticsApi.marketingBreakdown(range, dim, excludeBots, excludeTests),
    [range, dim, excludeBots, excludeTests],
  );

  const s = summary.data;
  const sessTrend = s ? pct(s.sessions, s.previous.sessions) : null;
  const purchTrend = s ? pct(s.purchases, s.previous.purchases) : null;
  const revTrend = s ? pct(s.revenueRon, s.previous.revenueRon) : null;
  const convTrend = s ? pct(s.visitorConv, s.previous.visitorConv) : null;

  const rows = useMemo(() => {
    const list = breakdown.data?.rows ?? [];
    if (!sortBy) return list;
    const copy = [...list];
    copy.sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      const an = typeof av === 'number' ? av : -Infinity;
      const bn = typeof bv === 'number' ? bv : -Infinity;
      return sortDir === 'asc' ? an - bn : bn - an;
    });
    return copy;
  }, [breakdown.data, sortBy, sortDir]);

  const totals = useMemo(() => {
    const list = breakdown.data?.rows ?? [];
    return list.reduce(
      (acc, r) => {
        acc.sessions += r.sessions ?? 0;
        acc.visitors += r.visitors ?? 0;
        acc.initiated += r.initiated;
        acc.purchases += r.purchases;
        acc.failed += r.failed;
        acc.revenueRon += r.revenueRon;
        return acc;
      },
      { sessions: 0, visitors: 0, initiated: 0, purchases: 0, failed: 0, revenueRon: 0 },
    );
  }, [breakdown.data]);

  const hasTraffic = breakdown.data?.hasTraffic ?? true;
  const visibleColumns = MKT_COLUMNS.filter((c) => !c.trafficOnly || hasTraffic);

  function toggleSort(key: keyof MarketingBreakdownRow) {
    if (sortBy === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(key);
      setSortDir('desc');
    }
  }

  async function runBackfill() {
    if (backfilling) return;
    setBackfilling(true);
    try {
      // Întâi aducem numele noi din Stripe, apoi inferăm genul din nume + email.
      await AnalyticsApi.backfillBuyerNames(400).catch(() => null);
      const res = await AnalyticsApi.backfillBuyerGender(5000);
      toast({
        title: 'Gen completat',
        description: `${res.updated} plăți actualizate (${res.byName} din nume, ${res.byEmail} din email). ${res.skipped} rămase fără sursă.`,
      });
      summary.refetch();
      breakdown.refetch();
    } catch (e) {
      toast({ title: 'Eroare', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Bara de control: exclude boți */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Cumpărări, checkout-uri abandonate, trafic și conversie — defalcate pentru optimizarea campaniilor.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant={excludeTests ? 'default' : 'outline'}
            size="sm"
            onClick={() => setExcludeTests((v) => !v)}
            title="Exclude comenzile de test interne (serban2702 / @manelecadou.ro)"
          >
            {excludeTests ? 'Teste ascunse' : 'Teste incluse'}
          </Button>
          <Button
            variant={excludeBots ? 'default' : 'outline'}
            size="sm"
            onClick={() => setExcludeBots((v) => !v)}
          >
            {excludeBots ? '🤖 Boți excluși' : '🤖 Boți incluși'}
          </Button>
        </div>
      </div>

      {/* KPI principale */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Vizitatori (sesiuni)" value={s?.sessions.toLocaleString('ro-RO')} trend={sessTrend} icon={<Users />} tone="info" loading={summary.isLoading} sub={s ? `${s.visitors.toLocaleString('ro-RO')} unici · ${s.botSessions.toLocaleString('ro-RO')} boți` : undefined} />
        <KpiCard label="Cumpărări" value={s?.purchases.toLocaleString('ro-RO')} trend={purchTrend} icon={<CreditCard />} tone="success" loading={summary.isLoading} sub={s ? `din ${s.checkoutsInitiated.toLocaleString('ro-RO')} checkout-uri` : undefined} />
        <KpiCard label="Venit" value={s ? RON(s.revenueRon) : undefined} trend={revTrend} icon={<CircleDollarSign />} tone="primary" loading={summary.isLoading} sub={s ? `AOV ${RON(s.aov)}` : undefined} />
        <KpiCard label="Conversie vizitator" value={s ? `${s.visitorConv}%` : undefined} trend={convTrend} icon={<Target />} tone="warning" loading={summary.isLoading} sub={s ? `finalizare checkout ${s.checkoutConv}%` : undefined} />
      </div>

      {/* KPI secundare */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Checkout inițiate" value={s?.checkoutsInitiated.toLocaleString('ro-RO')} icon={<MousePointerClick />} loading={summary.isLoading} sub={s ? `${s.formStarts.toLocaleString('ro-RO')} au început formularul` : undefined} />
        <KpiCard label="Plăți eșuate" value={s?.failed.toLocaleString('ro-RO')} icon={<AlertTriangle />} tone="destructive" loading={summary.isLoading} sub={s && s.checkoutsInitiated > 0 ? `${Math.round((s.failed / s.checkoutsInitiated) * 100)}% din checkout` : undefined} />
        <KpiCard label="Abandonate (pending)" value={s?.abandoned.toLocaleString('ro-RO')} icon={<Timer />} loading={summary.isLoading} />
        <KpiCard label="Pagini văzute" value={s?.pageViews.toLocaleString('ro-RO')} icon={<Eye />} loading={summary.isLoading} sub={s ? `bounce ${s.bounceRate}% · ${fmtDuration(s.avgSessionSec)}/sesiune` : undefined} />
      </div>

      {/* Funnel */}
      <Card>
        <CardHeader>
          <CardTitle>Funnel conversie</CardTitle>
          <CardDescription>De la vizitator la plată finalizată — pe perioada selectată</CardDescription>
        </CardHeader>
        <CardContent>
          {summary.isLoading || !s ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="space-y-2.5">
              {(() => {
                const FUNNEL_LABELS: Record<string, string> = {
                  visitors: 'Vizitatori (sesiuni)',
                  form_start: 'Au început formularul',
                  checkout_init: 'Checkout inițiat',
                  purchase: 'Plată finalizată',
                };
                const top = s.funnel[0]?.count || 0;
                return s.funnel.map((step, i) => {
                  const prev = i === 0 ? step.count : s.funnel[i - 1].count;
                  const ofTotal = top > 0 ? Math.round((step.count / top) * 1000) / 10 : 0;
                  const ofPrev = prev > 0 ? Math.round((step.count / prev) * 1000) / 10 : 0;
                  return (
                    <div key={step.step}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium">{FUNNEL_LABELS[step.step] ?? step.step}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {step.count.toLocaleString('ro-RO')}{' '}
                          <span className="text-xs">({ofTotal}% total{i > 0 ? ` · ${ofPrev}% pas anterior` : ''})</span>
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-primary to-amber-300 rounded-full" style={{ width: `${ofTotal}%` }} />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Matricea de defalcare */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Defalcare detaliată</CardTitle>
              <CardDescription>Alege un criteriu (rânduri). Click pe coloană pentru sortare.</CardDescription>
            </div>
          </div>
          {/* Selector dimensiune — chips grupate */}
          <div className="mt-3 space-y-2">
            {MKT_DIMENSIONS.map((g) => (
              <div key={g.group} className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground w-16 shrink-0">{g.group}</span>
                <div className="flex gap-1.5 flex-wrap">
                  {g.items.map((it) => (
                    <button
                      key={it.value}
                      onClick={() => { setDim(it.value); setSortBy(null); }}
                      className={cn(
                        'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                        dim === it.value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-secondary/40 border-border hover:bg-secondary text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {it.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {dim === 'buyerGender' && s && (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                Gen cunoscut pentru <strong className="text-foreground">{s.buyerGenderCoverage}%</strong> din cumpărări, inferat din numele Stripe + emailul clientului.
                Necunoscutele rămase sunt mai ales comenzi de test interne și clienți de pe site-urile BG/GR (nume non-românești).
              </span>
              <Button variant="outline" size="sm" onClick={runBackfill} disabled={backfilling}>
                {backfilling ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Recompletează genul'}
              </Button>
            </div>
          )}
          {breakdown.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : rows.length === 0 ? (
            <Empty title="Date insuficiente" description="Nicio înregistrare pentru perioada selectată." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-card">Criteriu</TableHead>
                    {visibleColumns.map((c) => (
                      <TableHead
                        key={c.key}
                        className="text-right cursor-pointer select-none whitespace-nowrap"
                        onClick={() => toggleSort(c.key)}
                        title={c.hint}
                      >
                        {c.label}
                        {sortBy === c.key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="font-medium sticky left-0 bg-card max-w-[220px] truncate" title={r.label}>{r.label}</TableCell>
                      {visibleColumns.map((c) => {
                        const val = r[c.key] as number | null;
                        const isConv = c.kind === 'pct';
                        return (
                          <TableCell
                            key={c.key}
                            className={cn(
                              'text-right tabular-nums whitespace-nowrap',
                              c.key === 'purchases' && (val ?? 0) > 0 && 'text-success font-medium',
                              c.key === 'revenueRon' && (val ?? 0) > 0 && 'font-medium',
                              isConv && val != null && val >= 3 && 'text-success',
                              c.key === 'failed' && (val ?? 0) > 0 && 'text-destructive',
                            )}
                          >
                            {fmtCell(val, c.kind)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                  {/* Total */}
                  <TableRow className="border-t-2 border-border font-semibold">
                    <TableCell className="sticky left-0 bg-card">Total ({rows.length})</TableCell>
                    {visibleColumns.map((c) => {
                      let content = '—';
                      if (c.key === 'sessions') content = fmtCell(totals.sessions, 'num');
                      else if (c.key === 'visitors') content = fmtCell(totals.visitors, 'num');
                      else if (c.key === 'initiated') content = fmtCell(totals.initiated, 'num');
                      else if (c.key === 'purchases') content = fmtCell(totals.purchases, 'num');
                      else if (c.key === 'failed') content = fmtCell(totals.failed, 'num');
                      else if (c.key === 'revenueRon') content = fmtCell(totals.revenueRon, 'money');
                      else if (c.key === 'aov') content = fmtCell(totals.purchases > 0 ? Math.round(totals.revenueRon / totals.purchases) : null, 'money');
                      else if (c.key === 'visitorConv') content = fmtCell(totals.sessions > 0 ? Math.round((totals.purchases / totals.sessions) * 10000) / 100 : null, 'pct');
                      else if (c.key === 'checkoutConv') content = fmtCell(totals.initiated > 0 ? Math.round((totals.purchases / totals.initiated) * 10000) / 100 : null, 'pct');
                      return <TableCell key={c.key} className="text-right tabular-nums whitespace-nowrap">{content}</TableCell>;
                    })}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============== OVERVIEW ==============

function OverviewTab({ range }: { range: { from: string; to: string } }) {
  const overview = useAsync(() => AnalyticsApi.overview(range), [range]);
  const ts = useAsync(() => AnalyticsApi.timeSeries(range), [range]);
  const funnel = useAsync(() => AnalyticsApi.funnel(range), [range]);
  const sources = useAsync(() => AnalyticsApi.sources(range), [range]);
  const revBySource = useAsync(() => AnalyticsApi.revenueBySource(range), [range]);
  const revByCampaign = useAsync(() => AnalyticsApi.revenueByCampaign(range), [range]);
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

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4 text-success" />
            <CardTitle>Venit pe sursă</CardTitle>
          </div>
          <CardDescription>
            Cât s-a încasat (plăți reușite) atribuit fiecărui canal — last non-direct touch, punte pe user/guest/IP. Folosește-l să decizi unde pui buget.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {revBySource.isLoading || !revBySource.data ? (
            <Skeleton className="h-44 w-full" />
          ) : revBySource.data.length === 0 ? (
            <Empty title="Niciun venit în perioadă" />
          ) : (
            (() => {
              const totalRev = revBySource.data.reduce((s, r) => s + r.revenueCents, 0);
              return (
                <div className="space-y-3">
                  {revBySource.data.map((r) => {
                    const meta = sourceMeta(r.source);
                    const share = totalRev > 0 ? (r.revenueCents / totalRev) * 100 : 0;
                    return (
                      <div key={r.source}>
                        <div className="flex items-center justify-between text-sm mb-1 gap-2">
                          <span className="font-medium flex items-center gap-1.5 min-w-0">
                            <span>{meta.emoji}</span>
                            <span className="truncate">{meta.label}</span>
                            <span className="text-xs text-muted-foreground">· {r.paidCount} {r.paidCount === 1 ? 'plată' : 'plăți'}</span>
                          </span>
                          <span className="tabular-nums font-semibold whitespace-nowrap">
                            {RON(r.revenueCents)}
                            <span className="text-xs text-muted-foreground font-normal ml-1.5">({Math.round(share)}%)</span>
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-success to-emerald-300 rounded-full"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-2 mt-1 border-t border-border flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total atribuit</span>
                    <span className="tabular-nums font-semibold">{RON(totalRev)}</span>
                  </div>
                </div>
              );
            })()
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <CardTitle>Venit pe campanie</CardTitle>
          </div>
          <CardDescription>
            Venitul atribuit fiecărei campanii (utm_campaign) — vezi exact ce reclamă aduce bani, nu doar canalul.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {revByCampaign.isLoading || !revByCampaign.data ? (
            <Skeleton className="h-44 w-full" />
          ) : revByCampaign.data.length === 0 ? (
            <Empty title="Niciun venit în perioadă" />
          ) : (
            (() => {
              const rowsC = revByCampaign.data.slice(0, 15);
              const maxRev = Math.max(...rowsC.map((r) => r.revenueCents), 1);
              return (
                <div className="space-y-3">
                  {rowsC.map((r, i) => {
                    const meta = sourceMeta(r.source);
                    const widthPct = (r.revenueCents / maxRev) * 100;
                    return (
                      <div key={`${r.source}-${r.campaign}-${i}`}>
                        <div className="flex items-center justify-between text-sm mb-1 gap-2">
                          <span className="font-medium flex items-center gap-1.5 min-w-0">
                            <span title={meta.label}>{meta.emoji}</span>
                            <span className="truncate" title={r.campaign || 'fără campanie'}>
                              {r.campaign || <span className="text-muted-foreground italic">fără campanie</span>}
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0">· {r.paidCount} {r.paidCount === 1 ? 'plată' : 'plăți'}</span>
                          </span>
                          <span className="tabular-nums font-semibold whitespace-nowrap">{RON(r.revenueCents)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-primary to-amber-300 rounded-full"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Emoji + label scurt pentru o sursă normalizată (revenue-by-source). */
function sourceMeta(source: string): { emoji: string; label: string } {
  const map: Record<string, { emoji: string; label: string }> = {
    facebook: { emoji: '📘', label: 'Facebook' },
    instagram: { emoji: '📷', label: 'Instagram' },
    tiktok: { emoji: '🎵', label: 'TikTok' },
    google: { emoji: '🔎', label: 'Google' },
    youtube: { emoji: '📺', label: 'YouTube' },
    whatsapp: { emoji: '💬', label: 'WhatsApp' },
    telegram: { emoji: '✈️', label: 'Telegram' },
    direct: { emoji: '🔗', label: 'Direct' },
    '(direct)': { emoji: '🔗', label: 'Direct' },
    email: { emoji: '✉️', label: 'Email' },
    newsletter: { emoji: '✉️', label: 'Newsletter' },
  };
  return map[source.toLowerCase()] ?? { emoji: '🌐', label: source };
}

// ============== USERS ==============

// ============== ENGAGEMENT (play / download / share pe piesa livrată) ==============

function EngagementTab({ range }: { range: { from: string; to: string } }) {
  const eng = useAsync(() => AnalyticsApi.engagement(range), [range.from, range.to]);
  const d = eng.data;
  const byType = (t: string) => d?.events.find((e) => e.type === t);
  const play = byType('song_play');
  const download = byType('song_download');
  const share = byType('song_share');
  const imageDl = byType('image_download');

  const num = (n?: number) => (n ?? 0).toLocaleString('ro-RO');
  const people = (e?: { uniqueSessions: number }) =>
    e ? `${num(e.uniqueSessions)} persoane` : undefined;

  const CHANNEL_LABEL: Record<string, string> = {
    native: '📤 Trimite (nativ)',
    facebook: '📘 Facebook',
    whatsapp: '💬 WhatsApp',
    twitter: '𝕏 Twitter',
    copy_link: '🔗 Copiază link',
    other: 'Altele',
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Acțiuni pe piesa livrată (pagina melodiei). <b>Total</b> = câte click-uri în interval ·{' '}
        <b>persoane</b> = sesiuni distincte.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Ascultări (play)" value={num(play?.count)} icon={<Play />} tone="info" loading={eng.isLoading} sub={people(play)} />
        <KpiCard label="Descărcări MP3" value={num(download?.count)} icon={<Download />} tone="primary" loading={eng.isLoading} sub={people(download)} />
        <KpiCard label="Share-uri" value={num(share?.count)} icon={<Share2 />} tone="success" loading={eng.isLoading} sub={people(share)} />
        <KpiCard label="Descărcări poză" value={num(imageDl?.count)} icon={<ImageIcon />} tone="warning" loading={eng.isLoading} sub={people(imageDl)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownCard
          title="Share pe canal"
          description="Cum își trimit clienții melodia mai departe"
          loading={eng.isLoading}
          rows={(d?.shareChannels ?? []).map((c) => ({
            label: CHANNEL_LABEL[c.channel] ?? c.channel,
            value: c.count,
          }))}
        />
      </div>
    </div>
  );
}

function UsersSessionsTab({ range }: { range: { from: string; to: string } }) {
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

      {/* Sesiuni recente (drill-down individual) — combinat în același tab cu userii. */}
      <SessionsTab range={range} />
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

// ============== PROFITABILITATE ==============

/** Cheltuielile au început în mai 2026 — generăm un input per lună/an de atunci. */
const PROFIT_START_YEAR = 2026;
const PROFIT_START_MONTH = 5; // mai

/** Lunile calendaristice din 05.2026 până în luna curentă (inclusiv). */
function profitMonths(): Array<{ key: string; label: string }> {
  const now = new Date();
  const res: Array<{ key: string; label: string }> = [];
  let y = PROFIT_START_YEAR;
  let m = PROFIT_START_MONTH;
  const ny = now.getFullYear();
  const nm = now.getMonth() + 1;
  while (y < ny || (y === ny && m <= nm)) {
    res.push({
      key: `${y}-${String(m).padStart(2, '0')}`,
      label: format(new Date(y, m - 1, 1), 'LLL yyyy', { locale: ro }),
    });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return res;
}

/** Anii fiscali (mai→aprilie) din 2026 până în anul fiscal curent (inclusiv). */
function profitFiscalYears(): Array<{ key: string; label: string }> {
  const now = new Date();
  const curFy = now.getMonth() + 1 >= PROFIT_START_MONTH ? now.getFullYear() : now.getFullYear() - 1;
  const res: Array<{ key: string; label: string }> = [];
  for (let fy = PROFIT_START_YEAR; fy <= curFy; fy++) {
    res.push({ key: String(fy), label: `mai ${fy} – apr ${fy + 1}` });
  }
  return res;
}

const CURRENCY_SYMBOL: Record<string, string> = { RON: 'lei', EUR: '€', USD: '$' };
const MONTHS_RO_SHORT = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'noi', 'dec'];

/** Lunea (ISO, UTC) săptămânii care conține data — IDENTIC cu backend-ul (cheia fxWeekly). */
function mondayOfUTC(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay(); // 0=duminică
  x.setUTCDate(x.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return x;
}

/** Săptămânile (luni→duminică) din 1 mai 2026 până în prezent. Cheia = lunea ISO. */
function profitWeeks(): Array<{ key: string; label: string }> {
  const start = mondayOfUTC(new Date(Date.UTC(PROFIT_START_YEAR, PROFIT_START_MONTH - 1, 1)));
  const now = new Date();
  const end = mondayOfUTC(now);
  const res: Array<{ key: string; label: string }> = [];
  const cur = new Date(start);
  let guard = 0;
  while (cur.getTime() <= end.getTime() && guard < 400) {
    const key = cur.toISOString().slice(0, 10);
    const sun = new Date(cur.getTime() + 6 * 86_400_000);
    const d1 = cur.getUTCDate();
    const d2 = sun.getUTCDate();
    const m1 = MONTHS_RO_SHORT[cur.getUTCMonth()];
    const m2 = MONTHS_RO_SHORT[sun.getUTCMonth()];
    res.push({ key, label: m1 === m2 ? `${d1}–${d2} ${m2}` : `${d1} ${m1} – ${d2} ${m2}` });
    cur.setUTCDate(cur.getUTCDate() + 7);
    guard++;
  }
  return res;
}

function ProfitabilityTab({ range }: { range: { from: string; to: string } }) {
  const [section, setSection] = useState<'stats' | 'settings'>('stats');
  const [refreshKey, setRefreshKey] = useState(0);
  const days = useMemo(
    () => ({
      fromDay: format(new Date(range.from), 'yyyy-MM-dd'),
      toDay: format(new Date(range.to), 'yyyy-MM-dd'),
    }),
    [range],
  );
  const report = useAsync(() => AnalyticsApi.profitability(range, days), [range, days, refreshKey]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Profit la nivel de business (toate site-urile): venituri reale (fără plățile de test ale echipei) minus
          cheltuieli, TVA, impozit și comisioane Stripe — pe perioada selectată.
        </p>
        <div className="flex items-center gap-1.5">
          <Button variant={section === 'stats' ? 'default' : 'outline'} size="sm" onClick={() => setSection('stats')}>
            <Calculator className="mr-2 h-4 w-4" /> Statistici
          </Button>
          <Button variant={section === 'settings' ? 'default' : 'outline'} size="sm" onClick={() => setSection('settings')}>
            <Receipt className="mr-2 h-4 w-4" /> Setări
          </Button>
        </div>
      </div>

      {section === 'stats' ? (
        <ProfitStats report={report.data} loading={report.isLoading} />
      ) : (
        <ProfitSettings onSaved={() => { setRefreshKey((k) => k + 1); setSection('stats'); }} />
      )}
    </div>
  );
}

function ProfitStats({ report, loading }: { report: ProfitReport | null; loading: boolean }) {
  const r = report;
  const profitTone = r ? (r.profitRonCents >= 0 ? 'success' : 'destructive') : 'default';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Venituri (fără teste)"
          value={r ? RON(r.revenueRonCents) : undefined}
          icon={<CircleDollarSign />}
          tone="success"
          loading={loading}
          sub={r ? `${r.range.days} ${r.range.days === 1 ? 'zi' : 'zile'} · plăți reale` : undefined}
        />
        <KpiCard
          label="Cheltuieli totale"
          value={r ? RON(r.totalExpensesRonCents) : undefined}
          icon={<TrendingDown />}
          tone="destructive"
          loading={loading}
          sub={r ? `incl. TVA ${r.vatRatePct}% + impozit ${r.microTaxRatePct}%` : undefined}
        />
        <KpiCard
          label="Profit net"
          value={r ? RON(r.profitRonCents) : undefined}
          icon={<PiggyBank />}
          tone={profitTone}
          loading={loading}
          sub={r ? (r.profitRonCents >= 0 ? 'pe plus' : 'pe minus') : undefined}
        />
        <KpiCard
          label="Marjă de profit"
          value={r ? `${r.marginPct}%` : undefined}
          icon={<Percent />}
          tone={r && r.marginPct >= 0 ? 'primary' : 'warning'}
          loading={loading}
          sub="profit ÷ venituri"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" /> Defalcare cheltuieli
          </CardTitle>
          <CardDescription>
            Toate sumele în lei. Meta + Suno + recurentele intră în baza de TVA ({r?.vatRatePct ?? 21}%).
            Impozitul și comisionul Stripe nu au TVA. Conversiile valutare folosesc cursul fiecărei
            săptămâni (setabil în „Setări"; implicit {r ? `1€=${r.fx.eurToRon} · 1$=${r.fx.usdToRon}` : '—'} lei).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading || !r ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cheltuială</TableHead>
                  <TableHead>Detaliu</TableHead>
                  <TableHead className="text-right">RON</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <ProfitRow
                  label="Meta Ads"
                  detail={r.meta.currency && r.meta.currency !== 'RON' ? `convertit din ${r.meta.currency} (curs săptămânal)` : 'din tab Ads & ROAS'}
                  cents={r.meta.ronCents}
                />
                <ProfitRow
                  label="Suno"
                  detail={`${r.suno.requests.toLocaleString('ro-RO')} requesturi × ${r.suno.usdPerRequest}$ (curs săptămânal)`}
                  cents={r.suno.ronCents}
                />
                {r.recurring.map((line) => (
                  <ProfitRow
                    key={line.id}
                    label={line.label}
                    detail={
                      <span className="inline-flex items-center gap-1.5">
                        <Badge variant="muted" className="text-[10px]">{line.cadence === 'monthly' ? 'lunar' : 'anual'}</Badge>
                        {line.currency !== 'RON' ? <span className="text-[11px]">convertit din {line.currency}</span> : null}
                      </span>
                    }
                    cents={line.ronCents}
                    muted={line.ronCents === 0}
                  />
                ))}
                <TableRow className="border-t border-border font-medium">
                  <TableCell>Subtotal (bază TVA)</TableCell>
                  <TableCell className="text-muted-foreground text-xs">Meta + Suno + recurente</TableCell>
                  <TableCell className="text-right tabular-nums">{RON(r.preVatTotalRonCents)}</TableCell>
                </TableRow>
                <ProfitRow label={`TVA ${r.vatRatePct}%`} detail="peste cheltuielile de mai sus" cents={r.vatRonCents} />
                <ProfitRow
                  label={`Impozit ${r.microTaxRatePct}%`}
                  detail="microîntreprindere (din venituri)"
                  cents={r.microTaxRonCents}
                  icon={<Landmark className="h-3.5 w-3.5" />}
                />
                <ProfitRow
                  label="Comision Stripe"
                  detail={
                    !r.stripeConfigured
                      ? 'Stripe neconfigurat'
                      : `real din API · ${r.stripeFee.paymentsKnown}/${r.stripeFee.paymentsTotal} plăți`
                  }
                  cents={r.stripeFee.ronCents}
                  icon={<CreditCard className="h-3.5 w-3.5" />}
                />
                <TableRow className="border-t-2 border-border font-semibold">
                  <TableCell>Total cheltuieli</TableCell>
                  <TableCell />
                  <TableCell className="text-right tabular-nums text-destructive">{RON(r.totalExpensesRonCents)}</TableCell>
                </TableRow>
                <TableRow className="font-semibold text-base">
                  <TableCell className="flex items-center gap-1.5">
                    <PiggyBank className="h-4 w-4 text-primary" /> Profit net
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs font-normal">venituri − cheltuieli</TableCell>
                  <TableCell className={cn('text-right tabular-nums', r.profitRonCents >= 0 ? 'text-success' : 'text-destructive')}>
                    {RON(r.profitRonCents)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProfitRow({
  label,
  detail,
  cents,
  muted,
  icon,
}: {
  label: string;
  detail?: React.ReactNode;
  cents: number;
  muted?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <TableRow className={cn(muted && 'opacity-50')}>
      <TableCell className="font-medium">
        <span className="inline-flex items-center gap-1.5">{icon}{label}</span>
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">{detail}</TableCell>
      <TableCell className="text-right tabular-nums">{RON(cents)}</TableCell>
    </TableRow>
  );
}

// ============== PROFITABILITATE — SETĂRI ==============

/** "30" / "30,5" / "30.5" → number. null dacă gol/invalid. */
function parseNum(s: string): number | null {
  const t = s.replace(',', '.').trim();
  if (t === '') return null;
  const n = parseFloat(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function ProfitSettings({ onSaved }: { onSaved: () => void }) {
  const { toast } = useToast();
  const cfgQ = useAsync(() => AnalyticsApi.profitConfig(), []);
  const [cfg, setCfg] = useState<ProfitConfigData | null>(null);
  const [saving, setSaving] = useState(false);
  const months = useMemo(() => profitMonths(), []);
  const years = useMemo(() => profitFiscalYears(), []);
  const weeks = useMemo(() => profitWeeks(), []);

  useEffect(() => {
    if (cfgQ.data) setCfg(JSON.parse(JSON.stringify(cfgQ.data)));
  }, [cfgQ.data]);

  if (!cfg) return <Skeleton className="h-96 w-full" />;

  const patch = (p: Partial<ProfitConfigData>) => setCfg((c) => (c ? { ...c, ...p } : c));
  const setWeekFx = (key: string, field: 'eurToRon' | 'usdToRon', val: number | null) =>
    setCfg((c) => {
      if (!c) return c;
      const fxWeekly = { ...c.fxWeekly };
      const cur = fxWeekly[key] ?? { eurToRon: 0, usdToRon: 0 };
      const next = { ...cur, [field]: val ?? 0 };
      // Săptămâna fără niciun curs setat → o eliminăm (cade pe cursul implicit).
      if ((next.eurToRon ?? 0) <= 0 && (next.usdToRon ?? 0) <= 0) delete fxWeekly[key];
      else fxWeekly[key] = next;
      return { ...c, fxWeekly };
    });
  const patchItem = (id: string, p: Partial<ProfitExpenseItem>) =>
    setCfg((c) => (c ? { ...c, items: c.items.map((it) => (it.id === id ? { ...it, ...p } : it)) } : c));
  const setItemAmount = (id: string, key: string, val: number | null) =>
    setCfg((c) => {
      if (!c) return c;
      return {
        ...c,
        items: c.items.map((it) => {
          if (it.id !== id) return it;
          const amounts = { ...it.amounts };
          if (val == null) delete amounts[key];
          else amounts[key] = val;
          return { ...it, amounts };
        }),
      };
    });
  const removeItem = (id: string) => setCfg((c) => (c ? { ...c, items: c.items.filter((it) => it.id !== id) } : c));
  const addItem = () =>
    setCfg((c) =>
      c
        ? {
            ...c,
            items: [
              ...c.items,
              {
                id: `custom_${Date.now().toString(36)}`,
                label: 'Cheltuială nouă',
                cadence: 'monthly',
                currency: 'RON',
                amounts: {},
                defaultAmount: null,
              },
            ],
          }
        : c,
    );

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      await AnalyticsApi.profitConfigSave(cfg);
      toast({ variant: 'success', title: 'Setări salvate', description: 'Calculele folosesc noile valori.' });
      onSaved();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Parametri globali */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Coins className="h-4 w-4 text-primary" /> Rate & cursuri implicite</CardTitle>
          <CardDescription>Cursurile implicite se folosesc pentru orice săptămână necompletată mai jos.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <NumField label="Curs EUR → RON (implicit)" value={cfg.fx.eurToRon} onChange={(v) => patch({ fx: { ...cfg.fx, eurToRon: v ?? 0 } })} />
          <NumField label="Curs USD → RON (implicit)" value={cfg.fx.usdToRon} onChange={(v) => patch({ fx: { ...cfg.fx, usdToRon: v ?? 0 } })} />
          <NumField label="Suno $ / request" value={cfg.sunoUsdPerRequest} onChange={(v) => patch({ sunoUsdPerRequest: v ?? 0 })} step="0.01" />
          <NumField label="TVA %" value={cfg.vatRatePct} onChange={(v) => patch({ vatRatePct: v ?? 0 })} />
          <NumField label="Impozit micro %" value={cfg.microTaxRatePct} onChange={(v) => patch({ microTaxRatePct: v ?? 0 })} step="0.1" />
        </CardContent>
      </Card>

      {/* Cursuri valutare săptămânale */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Coins className="h-4 w-4 text-primary" /> Cursuri valutare săptămânale</CardTitle>
          <CardDescription>
            Cursul fiecărei săptămâni (luni→duminică) se aplică tuturor zilelor ei la conversia cheltuielilor în lei.
            Lasă gol o săptămână ca să folosească cursul implicit de mai sus.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Săptămâna</TableHead>
                  <TableHead className="text-right">EUR → RON</TableHead>
                  <TableHead className="text-right">USD → RON</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weeks.map((w) => {
                  const fxw = cfg.fxWeekly[w.key];
                  return (
                    <TableRow key={w.key}>
                      <TableCell className="whitespace-nowrap font-medium capitalize">{w.label}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          className="w-24 ml-auto text-right"
                          inputMode="decimal"
                          type="number"
                          step="0.01"
                          placeholder={String(cfg.fx.eurToRon)}
                          value={fxw?.eurToRon ? String(fxw.eurToRon) : ''}
                          onChange={(e) => setWeekFx(w.key, 'eurToRon', parseNum(e.target.value))}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          className="w-24 ml-auto text-right"
                          inputMode="decimal"
                          type="number"
                          step="0.01"
                          placeholder={String(cfg.fx.usdToRon)}
                          value={fxw?.usdToRon ? String(fxw.usdToRon) : ''}
                          onChange={(e) => setWeekFx(w.key, 'usdToRon', parseNum(e.target.value))}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Cheltuieli recurente */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" /> Cheltuieli recurente</CardTitle>
              <CardDescription>
                Câte un input pe lună (sau pe an fiscal mai→apr). Suma se împarte la 30,5 (lunar) / 365 (anual) și se
                înmulțește cu zilele din intervalul selectat. „Implicit" se aplică perioadelor lăsate goale.
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={addItem}><Plus className="mr-2 h-4 w-4" /> Adaugă</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {cfg.items.map((it) => (
            <ProfitItemEditor
              key={it.id}
              item={it}
              periods={it.cadence === 'monthly' ? months : years}
              onPatch={(p) => patchItem(it.id, p)}
              onAmount={(key, val) => setItemAmount(it.id, key, val)}
              onRemove={() => removeItem(it.id)}
            />
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          <Save className="mr-2 h-4 w-4" /> {saving ? 'Se salvează…' : 'Salvează setările'}
        </Button>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number | null) => void;
  step?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        inputMode="decimal"
        type="number"
        step={step ?? '0.01'}
        value={String(value)}
        onChange={(e) => onChange(parseNum(e.target.value))}
      />
    </div>
  );
}

function ProfitItemEditor({
  item,
  periods,
  onPatch,
  onAmount,
  onRemove,
}: {
  item: ProfitExpenseItem;
  periods: Array<{ key: string; label: string }>;
  onPatch: (p: Partial<ProfitExpenseItem>) => void;
  onAmount: (key: string, val: number | null) => void;
  onRemove: () => void;
}) {
  const sym = CURRENCY_SYMBOL[item.currency] ?? item.currency;
  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1 min-w-[160px] flex-1">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Denumire</Label>
          <Input value={item.label} onChange={(e) => onPatch({ label: e.target.value })} maxLength={80} />
        </div>
        <div className="space-y-1 w-28">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Cadență</Label>
          <Select value={item.cadence} onValueChange={(v) => onPatch({ cadence: v as 'monthly' | 'yearly' })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Lunar</SelectItem>
              <SelectItem value="yearly">Anual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 w-24">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Monedă</Label>
          <Select value={item.currency} onValueChange={(v) => onPatch({ currency: v as 'RON' | 'EUR' | 'USD' })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="RON">RON</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 w-28">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Implicit</Label>
          <Input
            inputMode="decimal"
            placeholder="—"
            value={item.defaultAmount == null ? '' : String(item.defaultAmount)}
            onChange={(e) => onPatch({ defaultAmount: parseNum(e.target.value) })}
          />
        </div>
        <Button variant="ghost" size="icon-sm" className="text-destructive mb-0.5" onClick={onRemove} title="Șterge cheltuiala">
          <Trash2 />
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {periods.length === 0 ? (
          <span className="text-xs text-muted-foreground col-span-full">Nicio perioadă încă (din mai 2026).</span>
        ) : (
          periods.map((p) => {
            const v = item.amounts[p.key];
            return (
              <div key={p.key} className="space-y-1">
                <Label className="text-[10px] text-muted-foreground capitalize">{p.label}</Label>
                <div className="relative">
                  <Input
                    inputMode="decimal"
                    className="pr-7 text-sm"
                    placeholder={item.defaultAmount != null ? String(item.defaultAmount) : '0'}
                    value={v == null ? '' : String(v)}
                    onChange={(e) => onAmount(p.key, parseNum(e.target.value))}
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{sym}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
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
  // Cheltuiala e per zi calendaristică (TZ-ul contului de ads). Trimitem ziua
  // LOCALĂ a marginilor (nu felia UTC a instant-ului) ca să evităm off-by-one.
  const days = useMemo(
    () => ({
      fromDay: format(new Date(range.from), 'yyyy-MM-dd'),
      toDay: format(new Date(range.to), 'yyyy-MM-dd'),
    }),
    [range],
  );
  const report = useAsync(() => AnalyticsApi.adSpend(range, days), [range, days, refreshKey]);
  const r = report.data;

  const onSync = async () => {
    setSyncing(true);
    try {
      const res = await AnalyticsApi.adSpendSync(30);
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

  // Sincronizare automată la intrarea pe tab (o singură dată per montare). Tab-ul
  // se demontează când nu e activ, deci revenirea pe el re-declanșează sync-ul.
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (autoSyncedRef.current) return;
    autoSyncedRef.current = true;
    void onSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Cheltuieli trase din Meta &amp; TikTok Marketing API, defalcate pe campanie. ROAS = venit ÷ cheltuială.
          <span className="block text-xs opacity-70">Se sincronizează automat la deschiderea tab-ului.</span>
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
          value={r ? (r.costPerConversion != null ? money(r.costPerConversion, r.platforms.find((p) => p.currency)?.currency) : '—') : undefined}
          sub={r ? `${r.totalConversions} conversii (Purchase) · ${r.paidCount} plăți Stripe` : undefined}
          icon={<MousePointerClick />}
          tone="info"
          loading={report.isLoading}
        />
      </div>

      <AdPaymentsSection />

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

// ============== Plăți & alimentări Meta (cash-flow real, input manual) ==============

const AD_PAYMENT_TYPE_META: Record<AdPaymentType, { label: string; sign: string }> = {
  fund_loading: { label: 'Alimentare cont', sign: '+' },
  payment: { label: 'Plată factură / card', sign: '+' },
  refund: { label: 'Rambursare', sign: '−' },
};

/** "500" / "500,50" / "500.50" → cents. null dacă invalid. */
function centsFromAmount(s: string): number | null {
  const n = parseFloat(s.replace(',', '.').trim());
  if (!isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function AdPaymentsSection() {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdPayment | null>(null);
  // Reconcilierea e ALL-TIME (nu depinde de intervalul selectat sus) — plățile sunt
  // punctuale, deci compararea cu consumul are sens doar pe tot istoricul.
  const res = useAsync(() => AnalyticsApi.adPayments('meta'), [refreshKey]);
  const recon: AdPaymentReconciliation | undefined = res.data?.reconciliation;
  const payments = res.data?.payments ?? [];
  const cur = recon?.currency ?? 'RON';

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (p: AdPayment) => {
    setEditing(p);
    setDialogOpen(true);
  };

  const onDelete = async (p: AdPayment) => {
    const ok = await confirmDialog({
      title: 'Ștergi această plată?',
      description: `${AD_PAYMENT_TYPE_META[p.type].label} · ${money(p.amountCents, p.currency)} · ${p.date}`,
      variant: 'destructive',
      confirmText: 'Șterge',
    });
    if (!ok) return;
    try {
      await AnalyticsApi.adPaymentDelete(p.id);
      toast({ variant: 'success', title: 'Plată ștearsă' });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              Plăți & alimentări Meta
            </CardTitle>
            <CardDescription>
              Banii reali plătiți de tine către Meta (alimentări + facturi), față de consumul raportat. Totaluri pe tot istoricul — nu depind de perioada selectată sus. Introduse manual, fiindcă Marketing API nu expune plățile.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" /> Adaugă plată
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KpiCard
            label="Plătit / încărcat (total)"
            value={recon ? money(recon.totalPaidCents, cur) : undefined}
            icon={<Banknote />}
            tone="primary"
            loading={res.isLoading}
          />
          <KpiCard
            label="Consumat Meta (total)"
            value={recon ? money(recon.totalSpentCents, cur) : undefined}
            icon={<Megaphone />}
            tone="destructive"
            loading={res.isLoading}
          />
          <KpiCard
            label="Sold rămas (estimat)"
            value={recon ? money(recon.balanceCents, cur) : undefined}
            sub={recon ? (recon.balanceReliable ? 'plătit − consumat, tot istoricul' : 'incomplet — adaugă istoricul plăților') : undefined}
            icon={<PiggyBank />}
            tone={recon && recon.balanceCents >= 0 ? 'info' : 'destructive'}
            loading={res.isLoading}
          />
        </div>

        {recon?.mixedCurrencies ? (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-2.5 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
            <span>
              Ai plăți în mai multe monede. Reconcilierea de mai sus e calculată doar în <strong>{cur}</strong> (moneda contului Meta); plățile în alte monede apar în listă, dar nu intră în totaluri.
            </span>
          </div>
        ) : null}

        {res.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : payments.length === 0 ? (
          <Empty
            title="Nicio plată înregistrată"
            description="Adaugă prima alimentare sau factură către Meta ca să vezi reconcilierea cu consumul raportat."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tip</TableHead>
                <TableHead className="text-right">Sumă</TableHead>
                <TableHead>Referință</TableHead>
                <TableHead className="w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => {
                const m = AD_PAYMENT_TYPE_META[p.type];
                return (
                  <TableRow key={p.id}>
                    <TableCell className="tabular-nums text-muted-foreground whitespace-nowrap">{p.date}</TableCell>
                    <TableCell>
                      <Badge variant={p.type === 'refund' ? 'outline' : 'secondary'}>{m.label}</Badge>
                    </TableCell>
                    <TableCell className={cn('text-right tabular-nums font-medium whitespace-nowrap', p.type === 'refund' && 'text-warning')}>
                      {m.sign} {money(p.amountCents, p.currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {p.reference || '—'}
                      {p.note ? <span className="block text-xs opacity-70">{p.note}</span> : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(p)}>
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => onDelete(p)}>
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <AdPaymentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        defaultCurrency={cur}
        onSaved={() => {
          setDialogOpen(false);
          setRefreshKey((k) => k + 1);
        }}
      />
    </Card>
  );
}

function AdPaymentDialog({
  open,
  onOpenChange,
  editing,
  defaultCurrency,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: AdPayment | null;
  defaultCurrency: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<AdPaymentType>('fund_loading');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setType(editing.type);
      setAmount(String(editing.amountCents / 100));
      setCurrency(editing.currency);
      setDate(editing.date);
      setReference(editing.reference ?? '');
      setNote(editing.note ?? '');
    } else {
      setType('fund_loading');
      setAmount('');
      setCurrency(defaultCurrency);
      setDate(format(new Date(), 'yyyy-MM-dd'));
      setReference('');
      setNote('');
    }
  }, [open, editing, defaultCurrency]);

  const cents = centsFromAmount(amount);
  const valid = cents != null && cents > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && currency.trim().length >= 2;

  const onSubmit = async () => {
    if (cents == null || cents <= 0) return;
    setSaving(true);
    const body: AdPaymentInput = {
      platform: 'meta',
      type,
      amountCents: cents,
      currency: currency.trim().toUpperCase(),
      date,
      reference: reference.trim() || null,
      note: note.trim() || null,
    };
    try {
      if (editing) await AnalyticsApi.adPaymentUpdate(editing.id, body);
      else await AnalyticsApi.adPaymentCreate(body);
      toast({ variant: 'success', title: editing ? 'Plată actualizată' : 'Plată adăugată' });
      onSaved();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Editează plata' : 'Adaugă plată Meta'}</DialogTitle>
          <DialogDescription>
            Banii reali plătiți către Meta. Suma în unitatea monedei (ex. 500 = 500 {currency.toUpperCase()}).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tip</Label>
            <Select value={type} onValueChange={(v) => setType(v as AdPaymentType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fund_loading">Alimentare cont (prepaid)</SelectItem>
                <SelectItem value="payment">Plată factură / card</SelectItem>
                <SelectItem value="refund">Rambursare (scade)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Sumă</Label>
              <Input
                inputMode="decimal"
                placeholder="500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Monedă</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={8} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>
              Referință <span className="font-normal text-muted-foreground">(opțional)</span>
            </Label>
            <Input
              placeholder="Nr. factură Meta, ultimele 4 cifre card…"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={128}
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              Notă <span className="font-normal text-muted-foreground">(opțional)</span>
            </Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Anulează
          </Button>
          <Button onClick={onSubmit} disabled={!valid || saving}>
            {saving ? 'Se salvează…' : editing ? 'Salvează' : 'Adaugă'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [openCamp, setOpenCamp] = useState<Set<string>>(new Set());
  const [openAdset, setOpenAdset] = useState<Set<string>>(new Set());
  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, key: string) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setter(next);
  };
  const num = (n: number) => n.toLocaleString('ro-RO');

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
              <span className="text-muted-foreground">
                {' · '}{data.conversions} conversii{' · '}
                {data.costPerConversion != null ? `${money(data.costPerConversion, data.currency)}/conv` : '—/conv'}
              </span>
            </div>
          ) : null}
        </div>
        {data?.fetchedAt ? (
          <CardDescription>
            Ultima sincronizare: {format(new Date(data.fetchedAt), 'd MMM HH:mm', { locale: ro })} · click pe campanie pentru ad set-uri și ad-uri
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
                <TableHead>Campanie / Ad set / Ad</TableHead>
                <TableHead className="text-right">Cheltuială</TableHead>
                <TableHead className="text-right">Conversii</TableHead>
                <TableHead className="text-right">Cost/conv.</TableHead>
                <TableHead className="text-right">Impresii</TableHead>
                <TableHead className="text-right">Clickuri</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.campaigns.map((c) => {
                const campOpen = openCamp.has(c.campaignId);
                return (
                  <Fragment key={c.campaignId}>
                    <TableRow
                      className="cursor-pointer hover:bg-secondary/40"
                      onClick={() => toggle(openCamp, setOpenCamp, c.campaignId)}
                    >
                      <TableCell className="max-w-[320px]">
                        <span className="flex items-center gap-1.5 font-medium">
                          {campOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                          <span className="truncate" title={c.campaignName ?? c.campaignId}>{c.campaignName ?? c.campaignId}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium">{money(c.spendCents, c.currency)}</TableCell>
                      <TableCell className="text-right font-medium">{c.conversions}</TableCell>
                      <TableCell className="text-right">{c.costPerConversion != null ? money(c.costPerConversion, c.currency) : '—'}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{num(c.impressions)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{num(c.clicks)}</TableCell>
                    </TableRow>

                    {campOpen && c.adsets.map((s) => {
                      const adsetKey = `${c.campaignId}:${s.adsetId ?? 'none'}`;
                      const adsetOpen = openAdset.has(adsetKey);
                      return (
                        <Fragment key={adsetKey}>
                          <TableRow
                            className="cursor-pointer bg-secondary/20 hover:bg-secondary/40"
                            onClick={() => toggle(openAdset, setOpenAdset, adsetKey)}
                          >
                            <TableCell className="max-w-[320px] pl-8">
                              <span className="flex items-center gap-1.5 text-sm">
                                {adsetOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                                <span className="truncate" title={s.adsetName ?? s.adsetId ?? ''}>{s.adsetName ?? s.adsetId ?? '(fără ad set)'}</span>
                              </span>
                            </TableCell>
                            <TableCell className="text-right">{money(s.spendCents, s.currency)}</TableCell>
                            <TableCell className="text-right">{s.conversions}</TableCell>
                            <TableCell className="text-right">{s.costPerConversion != null ? money(s.costPerConversion, s.currency) : '—'}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{num(s.impressions)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{num(s.clicks)}</TableCell>
                          </TableRow>

                          {adsetOpen && s.ads.map((ad) => (
                            <TableRow key={ad.adId} className="bg-secondary/10">
                              <TableCell className="max-w-[320px] pl-16">
                                <span className="block truncate text-sm text-muted-foreground" title={ad.adName ?? ad.adId}>{ad.adName ?? ad.adId}</span>
                              </TableCell>
                              <TableCell className="text-right text-sm">{money(ad.spendCents, ad.currency)}</TableCell>
                              <TableCell className="text-right text-sm">{ad.conversions}</TableCell>
                              <TableCell className="text-right text-sm">{ad.costPerConversion != null ? money(ad.costPerConversion, ad.currency) : '—'}</TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground">{num(ad.impressions)}</TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground">{num(ad.clicks)}</TableCell>
                            </TableRow>
                          ))}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
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
