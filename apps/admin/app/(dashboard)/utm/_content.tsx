'use client';

import { useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import {
  AlertTriangle,
  Check,
  Copy,
  Info,
  Link2,
  Mail,
  MousePointerClick,
  Search,
  ShieldAlert,
  Sparkles,
  Wand2,
} from 'lucide-react';

import { useAsync } from '@/lib/hooks/use-async';
import {
  AnalyticsApi,
  EmailTrackingApi,
  type EmailPerformanceRow,
  type EmailRecipientRow,
  type EmailStatsDimension,
  type UtmSpec,
  type UtmTemplate,
} from '@/lib/api';
import { SitesApi, type SiteDto } from '@/lib/api/sites.api';
import { SpaLink } from '@/lib/spa-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DateRangePicker, type DateRangeValue } from '@/components/ui/date-range-picker';
import { Empty } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { ResponsiveTabs } from '@/components/ui/responsive-tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/cn';

/**
 * „Linkuri și UTM" — locul din care se copiază exact ce se lipește în Meta,
 * TikTok, Google și ChatGPT, plus rapoartele care ies din ele.
 *
 * Conținutul NU e scris aici: vine din `GET /admin/analytics/utm-spec`, adică
 * din `apps/api/src/modules/analytics/utm-standard.ts` — același fișier după
 * care agregăm. Duplicat în admin, ar fi divergat de la prima schimbare, iar
 * omul ar fi copiat de aici un șablon pe care backend-ul nu-l mai citește la fel.
 */

const RON = (cents: number) => `${(cents / 100).toLocaleString('ro-RO', { maximumFractionDigits: 2 })} lei`;
const PCT = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('ro-RO', { maximumFractionDigits: 1 })}%`);

export default function UtmPage() {
  const [range, setRange] = useState<DateRangeValue>({ from: subDays(new Date(), 29), to: new Date() });
  const rangeISO = useMemo(
    () => ({ from: range.from.toISOString(), to: range.to.toISOString() }),
    [range],
  );
  const [tab, setTab] = useState('templates');

  return (
    <div>
      <PageHeader
        title="Linkuri și UTM"
        description="Ce lipesc în reclame, cum arată rapoartele care ies din asta și cine apasă linkurile din emailuri."
        actions={tab === 'health' || tab === 'email' ? <DateRangePicker value={range} onChange={setRange} /> : undefined}
      />

      <ResponsiveTabs
        value={tab}
        onValueChange={setTab}
        listClassName="mb-5 max-w-full overflow-x-auto"
        tabs={[
          { value: 'templates', label: 'Șabloane' },
          { value: 'builder', label: 'Constructor link' },
          { value: 'dictionary', label: 'Dicționar' },
          { value: 'health', label: 'Verificare' },
          { value: 'email', label: 'Emailuri' },
        ]}
      >
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
        <TabsContent value="builder"><BuilderTab /></TabsContent>
        <TabsContent value="dictionary"><DictionaryTab /></TabsContent>
        <TabsContent value="health"><HealthTab range={rangeISO} /></TabsContent>
        <TabsContent value="email"><EmailTab range={rangeISO} /></TabsContent>
      </ResponsiveTabs>
    </div>
  );
}

// ============================== ȘABLOANE ==============================

function TemplatesTab() {
  const { data: spec, loading } = useAsync<UtmSpec>(() => AnalyticsApi.utmSpec(), []);
  const [openId, setOpenId] = useState<string | null>('meta');

  if (loading) return <Skeleton className="h-96 w-full" />;
  if (!spec) return <Empty title="Standardul UTM nu s-a putut încărca" description="Reîncarcă pagina." />;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5">
          <div className="flex gap-3">
            <Sparkles className="h-5 w-5 shrink-0 text-primary" />
            <div className="text-sm text-muted-foreground space-y-1.5">
              <p className="text-foreground font-medium">Regula, în trei rânduri.</p>
              <p>
                Fiecare reclamă duce spre un link care spune de unde vine. Copiezi șablonul platformei,
                îl lipești unde scrie mai jos și nu-l mai atingi — macro-urile din el sunt înlocuite automat
                de platformă la fiecare click.
              </p>
              <p>
                Din ele ies rândurile din <b>Analytics → Marketing</b> (canal, campanie, grup, creativ,
                plasare) și coloanele din <b>Payments</b>. Ce nu e etichetat ajunge la „direct" și nu se
                poate compara cu nimic.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {spec.templates.map((t) => (
        <TemplateCard key={t.id} t={t} open={openId === t.id} onToggle={() => setOpenId(openId === t.id ? null : t.id)} />
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> UTM ≠ pixel
          </CardTitle>
          <CardDescription>
            Sunt două lucruri diferite și amândouă sunt necesare.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <b className="text-foreground">UTM-urile</b> spun <i>nouă</i> din ce reclamă a venit omul —
            de aici ies rândurile din Analytics și coloanele din Payments.
          </p>
          <p>
            <b className="text-foreground">Pixelii</b> (Meta, TikTok, Google, ChatGPT) spun <i>platformei</i>
            ce s-a întâmplat, ca să-și optimizeze livrarea. Se configurează per site, în{' '}
            <SpaLink href="/site/operations" className="font-medium text-primary hover:underline">
              Acest site → Operațiuni → Măsurare
            </SpaLink>
            .
          </p>
          <p>
            Fără UTM nu poți compara canalele între ele. Fără pixel, campania nu învață pe cine să caute.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Click-ID-urile capturate automat</CardTitle>
          <CardDescription>
            Puse de platformă, nu de noi. Dacă uiți UTM-urile pe o reclamă, atribuirea ține tot din astea —
            dar fără campanie și fără creativ.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {spec.clickIds.map((c) => (
              <Badge key={c.param} variant="secondary" className="font-mono text-[11px]">
                {c.param} → {c.source}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TemplateCard({ t, open, onToggle }: { t: UtmTemplate; open: boolean; onToggle: () => void }) {
  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={onToggle}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">{t.platform}</CardTitle>
            <CardDescription className="mt-1">{t.where}</CardDescription>
          </div>
          <Badge variant="outline" className="shrink-0">{open ? 'Ascunde' : 'Detalii'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Copyable value={t.suffix} label={'Șirul de lipit (fără „?” la început)'} />
        {open && (
          <>
            <p className="text-xs text-muted-foreground">{t.scope}</p>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/40">
                    <th className="px-3 py-2 text-left text-xs font-semibold">Parametru</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Valoare</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Ce înseamnă</th>
                  </tr>
                </thead>
                <tbody>
                  {t.fields.map((f) => (
                    <tr key={f.param} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 font-mono text-[12px] whitespace-nowrap">{f.param}</td>
                      <td className="px-3 py-2 font-mono text-[12px] text-primary break-all">{f.value}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{f.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {t.notes.length > 0 && (
              <ul className="space-y-1.5">
                {t.notes.map((n, i) => (
                  <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            )}
            {t.warnings.length > 0 && (
              <ul className="space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                {t.warnings.map((w, i) => (
                  <li key={i} className="flex gap-2 text-xs">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================== CONSTRUCTOR ==============================

/** Aceeași normalizare ca `utmSlug` din API — valorile scrise de mână ajung altfel
 *  în raport în trei variante („Cadou Mama", „cadou mama", „cadou-mama"). */
function slug(v: string, max = 64): string {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u021b\u0163]/gi, 't')
    .replace(/[\u0219\u015f\u017f]/gi, 's')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
}

function BuilderTab() {
  const { data: spec } = useAsync<UtmSpec>(() => AnalyticsApi.utmSpec(), []);
  const { data: sites } = useAsync<SiteDto[]>(() => SitesApi.list(), []);

  const [baseUrl, setBaseUrl] = useState('');
  const [source, setSource] = useState('meta');
  const [medium, setMedium] = useState('paid_social');
  const [campaign, setCampaign] = useState('');
  const [content, setContent] = useState('');
  const [term, setTerm] = useState('');
  const [ui, setUi] = useState('');

  useEffect(() => {
    if (!baseUrl && sites && sites.length > 0) {
      const d = sites[0].domain;
      if (d) setBaseUrl(/^https?:\/\//i.test(d) ? d : `https://${d}`);
    }
  }, [sites, baseUrl]);

  const built = useMemo(() => {
    if (!baseUrl.trim()) return '';
    let u: URL;
    try {
      u = new URL(/^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`);
    } catch {
      return '';
    }
    const put = (k: string, v: string) => {
      const s = v.trim();
      if (s) u.searchParams.set(k, s);
    };
    put('utm_source', source);
    put('utm_medium', medium);
    put('utm_campaign', slug(campaign, 128));
    put('utm_content', slug(content, 128));
    put('utm_term', slug(term, 128));
    if (ui) u.searchParams.set('ui', ui);
    return u.toString();
  }, [baseUrl, source, medium, campaign, content, term, ui]);

  const naming = spec?.naming;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Wand2 className="h-4 w-4" /> Construiește linkul</CardTitle>
          <CardDescription>
            Pentru plasările unde scrii valorile de mână: ChatGPT, postări organice, influenceri, QR-uri.
            La Meta/TikTok/Google folosește șabloanele cu macro-uri — se completează singure.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Pagina de destinație">
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://manelecadou.ro" />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="utm_source — platforma">
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(spec?.sources ?? []).map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.value} — {s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="utm_medium — tipul de trafic">
              <Select value={medium} onValueChange={setMedium}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(spec?.mediums ?? []).map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.value} — {m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label={`utm_campaign — ${naming?.campaign.pattern ?? 'campania'}`} hint={naming?.campaign.example}>
            <Input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder={naming?.campaign.example ?? 'ro-conv-cadou-0926'} />
          </Field>
          <Field label={`utm_content — ${naming?.content.pattern ?? 'creativul'}`} hint={naming?.content.example}>
            <Input value={content} onChange={(e) => setContent(e.target.value)} placeholder={naming?.content.example ?? 'video-reactie-mama-v2'} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="utm_term — cuvânt cheie / audiență (opțional)">
              <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="femei-35-55" />
            </Field>
            <Field label="Interfață (opțional)" hint="Lipește vizitatorul pe design 365 de zile. Folosește doar deliberat.">
              <Select value={ui || 'none'} onValueChange={(v) => setUi(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— implicită —</SelectItem>
                  <SelectItem value="classic">classic</SelectItem>
                  <SelectItem value="cadou">cadou</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Link2 className="h-4 w-4" /> Linkul final</CardTitle>
          </CardHeader>
          <CardContent>
            {built ? (
              <Copyable value={built} label="Gata de lipit" />
            ) : (
              <p className="text-sm text-muted-foreground">Completează pagina de destinație.</p>
            )}
          </CardContent>
        </Card>

        {naming && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Convenția de nume</CardTitle>
              <CardDescription>Ca aceeași campanie să nu apară pe trei rânduri diferite.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <NamingBlock title="Campanie" pattern={naming.campaign.pattern} example={naming.campaign.example} rules={naming.campaign.rules} />
              <NamingBlock title="Creativ" pattern={naming.content.pattern} example={naming.content.example} rules={naming.content.rules} />
              <ul className="space-y-1.5 border-t border-border pt-3">
                {naming.general.map((g, i) => (
                  <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function NamingBlock({ title, pattern, example, rules }: { title: string; pattern: string; example: string; rules: string[] }) {
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
        <span className="font-medium">{title}</span>
        <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px]">{pattern}</code>
        <span className="text-xs text-muted-foreground">ex. <code className="font-mono text-primary">{example}</code></span>
      </div>
      <ul className="space-y-1 pl-1">
        {rules.map((r, i) => (
          <li key={i} className="text-xs text-muted-foreground">· {r}</li>
        ))}
      </ul>
    </div>
  );
}

// ============================== DICȚIONAR ==============================

function DictionaryTab() {
  const { data: spec, loading } = useAsync<UtmSpec>(() => AnalyticsApi.utmSpec(), []);
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (!spec) return <Empty title="Nu s-a putut încărca" description="Reîncarcă pagina." />;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">utm_source — platforma</CardTitle>
            <CardDescription>Unde a stat linkul. Mai multe surse se pot uni într-un singur canal.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {spec.sources.map((s) => (
              <div key={s.value} className="flex items-start justify-between gap-3 border-b border-border/50 py-1.5 last:border-0">
                <code className="font-mono text-[12px] text-primary shrink-0">{s.value}</code>
                <span className="text-xs text-muted-foreground text-right">{s.label}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">utm_medium — tipul de trafic</CardTitle>
            <CardDescription>Nu platforma: tipul. De aici ies rapoartele de cost pe canal.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {spec.mediums.map((m) => (
              <div key={m.value} className="border-b border-border/50 py-1.5 last:border-0">
                <div className="flex items-baseline justify-between gap-3">
                  <code className="font-mono text-[12px] text-primary">{m.value}</code>
                  <span className="text-xs">{m.label}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{m.when}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-destructive" /> Ce se strică și cum arată în rapoarte
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {spec.pitfalls.map((p, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium">{p.symptom}</p>
              <p className="mt-1 text-xs text-muted-foreground"><b>De ce:</b> {p.cause}</p>
              <p className="mt-0.5 text-xs text-muted-foreground"><b>Ce faci:</b> {p.fix}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parametrii capturați</CardTitle>
          <CardDescription>Tot ce citim din URL la aterizare. Restul se ignoră.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {spec.params.map((p) => (
              <Badge key={p} variant="secondary" className="font-mono text-[11px]">{p}</Badge>
            ))}
            {spec.clickIds.map((c) => (
              <Badge key={c.param} variant="outline" className="font-mono text-[11px]">{c.param}</Badge>
            ))}
            <Badge variant="outline" className="font-mono text-[11px]">{spec.emailClickParam}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================== VERIFICARE ==============================

function HealthTab({ range }: { range: { from: string; to: string } }) {
  const { data, loading } = useAsync(() => AnalyticsApi.utmHealth(range), [range.from, range.to]);
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (!data) return <Empty title="Fără date" description="Nicio sesiune în intervalul ales." />;

  const t = data.totals;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sesiuni" value={t.sessions.toLocaleString('ro-RO')} />
        <Stat label="Cu campanie etichetată" value={t.withCampaign.toLocaleString('ro-RO')} hint={t.sessions ? `${Math.round((t.withCampaign / t.sessions) * 100)}% din total` : undefined} />
        <Stat
          label="Reclame fără UTM"
          value={t.untaggedAds.toLocaleString('ro-RO')}
          hint="Au click-id de la platformă, dar nicio campanie"
          tone={t.untaggedAds > 0 ? 'bad' : 'good'}
        />
        <Stat
          label="Campanii fără utm_id"
          value={t.campaignsWithoutId.toLocaleString('ro-RO')}
          hint="Nu se pot lega exact de cheltuială"
          tone={t.campaignsWithoutId > 0 ? 'warn' : 'good'}
        />
      </div>

      {data.issues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Probleme găsite</CardTitle>
            <CardDescription>Ordonate după câte sesiuni afectează.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Problemă</TableHead>
                  <TableHead>Valoarea găsită</TableHead>
                  <TableHead className="text-right">Sesiuni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.issues.map((i, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={cn('h-2 w-2 rounded-full', i.severity === 'high' ? 'bg-destructive' : i.severity === 'medium' ? 'bg-warning' : 'bg-muted-foreground')} />
                        <span className="text-sm">{i.label}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[12px] text-muted-foreground break-all">{i.sample ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.count.toLocaleString('ro-RO')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acoperire pe canal</CardTitle>
          <CardDescription>
            Cât din traficul fiecărui canal vine cu campanie. Pe canalele plătite ar trebui să fie aproape 100%;
            pe „direct" și „referral" e normal să fie 0.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Canal</TableHead>
                <TableHead className="text-right">Sesiuni</TableHead>
                <TableHead className="text-right">Etichetate</TableHead>
                <TableHead className="text-right">Acoperire</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byChannel.map((c) => (
                <TableRow key={c.channel}>
                  <TableCell className="font-medium">{c.channel}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.sessions.toLocaleString('ro-RO')}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.tagged.toLocaleString('ro-RO')}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.taggedPct}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================== EMAILURI ==============================

function EmailTab({ range }: { range: { from: string; to: string } }) {
  const [dimension, setDimension] = useState<EmailStatsDimension>('campaign');
  const [selected, setSelected] = useState<string | null>(null);

  const { data, loading } = useAsync(
    () => EmailTrackingApi.performance(range, dimension),
    [range.from, range.to, dimension],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5">
          <div className="flex gap-3">
            <Mail className="h-5 w-5 shrink-0 text-primary" />
            <div className="text-sm text-muted-foreground space-y-1.5">
              <p className="text-foreground font-medium">Cum se măsoară.</p>
              <p>
                Fiecare link din emailurile noastre e rescris prin <code className="font-mono text-[11px]">/api/e/c/&lt;token&gt;</code>,
                cu un token unic per destinatar. De aici ies „cine a apăsat", „când" și „de câte ori", plus venitul
                generat de fiecare mesaj în parte.
              </p>
              <p>
                <b>Deschiderile</b> vin dintr-un pixel și sunt orientative — Gmail preîncarcă imaginile prin proxy-ul lui.
                <b> Clicul</b> e dovada reală. Roboții de scanare ai furnizorilor de email sunt marcați și excluși din cifre.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={dimension} onValueChange={(v) => { setDimension(v as EmailStatsDimension); setSelected(null); }}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="campaign">Pe campanie</SelectItem>
            <SelectItem value="kind">Pe categorie de email</SelectItem>
            <SelectItem value="link">Pe buton / link</SelectItem>
            <SelectItem value="day">Pe zile</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4"><Skeleton className="h-64 w-full" /></div>
          ) : !data || data.rows.length === 0 ? (
            <Empty
              title="Niciun email urmărit în interval"
              description="Statisticile apar după primul email trimis cu urmărirea activă (Settings → Marketing → Urmărire emailuri)."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{dimension === 'kind' ? 'Categorie' : dimension === 'link' ? 'Buton' : dimension === 'day' ? 'Zi' : 'Campanie'}</TableHead>
                    <TableHead className="text-right">Destinatari</TableHead>
                    <TableHead className="text-right">Deschideri</TableHead>
                    <TableHead className="text-right">Clicuri</TableHead>
                    <TableHead className="text-right">Rată click</TableHead>
                    <TableHead className="text-right">Comenzi</TableHead>
                    <TableHead className="text-right">Venit</TableHead>
                    <TableHead className="text-right">Conversie</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r) => (
                    <EmailRow
                      key={r.key}
                      r={r}
                      selectable={dimension === 'campaign' || dimension === 'kind'}
                      onSelect={() => setSelected(selected === r.key ? null : r.key)}
                      selected={selected === r.key}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <RecipientsCard
          range={range}
          filter={dimension === 'kind' ? { kind: selected } : { campaign: selected }}
          title={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function EmailRow({
  r, selectable, onSelect, selected,
}: { r: EmailPerformanceRow; selectable: boolean; onSelect: () => void; selected: boolean }) {
  return (
    <TableRow
      className={cn(selectable && 'cursor-pointer', selected && 'bg-secondary/50')}
      onClick={selectable ? onSelect : undefined}
    >
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {selectable && <MousePointerClick className="h-3.5 w-3.5 text-muted-foreground" />}
          <span className="break-all">{r.key}</span>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">{r.recipients.toLocaleString('ro-RO')}</TableCell>
      <TableCell className="text-right tabular-nums">
        {r.uniqueOpens.toLocaleString('ro-RO')}
        <span className="ml-1 text-xs text-muted-foreground">{PCT(r.openRate)}</span>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {r.uniqueClicks.toLocaleString('ro-RO')}
        {r.clicks > r.uniqueClicks && (
          <span className="ml-1 text-xs text-muted-foreground">({r.clicks} total)</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{PCT(r.clickRate)}</TableCell>
      <TableCell className="text-right tabular-nums">{r.purchases.toLocaleString('ro-RO')}</TableCell>
      <TableCell className="text-right tabular-nums font-medium">{RON(r.revenueRon)}</TableCell>
      <TableCell className="text-right tabular-nums">{PCT(r.conversionRate)}</TableCell>
    </TableRow>
  );
}

function RecipientsCard({
  range, filter, title, onClose,
}: {
  range: { from: string; to: string };
  filter: { campaign?: string; kind?: string };
  title: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const { data, loading } = useAsync<EmailRecipientRow[]>(
    () => EmailTrackingApi.recipients(range, { ...filter, email: email || undefined, limit: 200 }),
    [range.from, range.to, filter.campaign, filter.kind, email],
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="text-base break-all">Cine a apăsat · {title}</CardTitle>
            <CardDescription>Un rând per destinatar, cu numărul de apăsări și ce a cumpărat după.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Caută email" className="h-8 w-48 pl-7 text-sm" />
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>Închide</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-4"><Skeleton className="h-48 w-full" /></div>
        ) : !data || data.length === 0 ? (
          <Empty title="Niciun destinatar" description="Nimeni nu a primit acest email în intervalul ales." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Mesaje</TableHead>
                  <TableHead className="text-right">Deschideri</TableHead>
                  <TableHead className="text-right">Clicuri</TableHead>
                  <TableHead>Primul click</TableHead>
                  <TableHead>Ultimul click</TableHead>
                  <TableHead className="text-right">Venit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r) => (
                  <TableRow key={r.email}>
                    <TableCell className="font-medium break-all">{r.email}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.emails}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.opens}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.clicks > 0 ? <Badge variant="secondary">{r.clicks}×</Badge> : <span className="text-muted-foreground">0</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.firstClickAt)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.lastClickAt)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{r.revenueRon > 0 ? RON(r.revenueRon) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function fmtDate(v: string | null): string {
  if (!v) return '—';
  try {
    return format(new Date(v), 'dd MMM HH:mm');
  } catch {
    return '—';
  }
}

// ============================== bucăți mici ==============================

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn(
          'mt-1 text-2xl font-semibold tabular-nums',
          tone === 'bad' && 'text-destructive',
          tone === 'warn' && 'text-warning',
        )}>{value}</p>
        {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Copyable({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5">
      {label && <p className="text-xs text-muted-foreground">{label}</p>}
      <div className="relative">
        <pre className="overflow-x-auto rounded-md border border-border bg-background/60 px-3 py-2 pr-10 font-mono text-[12px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-all">
          {value}
        </pre>
        <button
          type="button"
          title="Copiază"
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="absolute right-1.5 top-1.5 h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
