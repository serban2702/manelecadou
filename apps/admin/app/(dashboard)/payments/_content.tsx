'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAsync } from "@/lib/hooks/use-async";
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, CreditCard, ExternalLink, Music2, Search, X } from 'lucide-react';
import { AdminApi } from '@/lib/api';
import { OrderDetailModal } from '@/components/order-detail-modal';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200];
const STATUS_OPTIONS = [
  { value: 'all', label: 'Toate statusurile' },
  { value: 'paid', label: 'Plătite' },
  { value: 'pending', label: 'În așteptare' },
  { value: 'failed', label: 'Eșuate' },
  { value: 'refunded', label: 'Refundate' },
];
const SOURCE_OPTIONS = [
  { value: 'all', label: 'Toate sursele' },
  { value: 'facebook', label: '📘 Facebook' },
  { value: 'instagram', label: '📷 Instagram' },
  { value: 'tiktok', label: '🎵 TikTok' },
  { value: 'google', label: '🔎 Google' },
  { value: 'youtube', label: '📺 YouTube' },
  { value: 'whatsapp', label: '💬 WhatsApp' },
  { value: 'direct', label: '🔗 Direct' },
  { value: 'email', label: '✉️ Email' },
  { value: 'none', label: '— Fără sursă' },
];

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  paid: 'success',
  failed: 'destructive',
  pending: 'warning',
  refunded: 'muted',
};

/**
 * Mapare source → emoji + label scurt. Source-ul vine din UTM-uri sau e
 * derivat din referrer (analyticsService parsează `instagram.com` → 'instagram',
 * `t.co` → 'twitter', etc.). Necunoscute → afișate verbatim.
 */
const SOURCE_LABEL: Record<string, { emoji: string; label: string }> = {
  instagram: { emoji: '📷', label: 'Instagram' },
  ig: { emoji: '📷', label: 'Instagram' },
  tiktok: { emoji: '🎵', label: 'TikTok' },
  facebook: { emoji: '📘', label: 'Facebook' },
  fb: { emoji: '📘', label: 'Facebook' },
  meta: { emoji: '📘', label: 'Meta' },
  google: { emoji: '🔎', label: 'Google' },
  youtube: { emoji: '📺', label: 'YouTube' },
  yt: { emoji: '📺', label: 'YouTube' },
  whatsapp: { emoji: '💬', label: 'WhatsApp' },
  wa: { emoji: '💬', label: 'WhatsApp' },
  telegram: { emoji: '✈️', label: 'Telegram' },
  twitter: { emoji: '🐦', label: 'Twitter/X' },
  x: { emoji: '🐦', label: 'Twitter/X' },
  reddit: { emoji: '👽', label: 'Reddit' },
  email: { emoji: '✉️', label: 'Email' },
  newsletter: { emoji: '✉️', label: 'Newsletter' },
  direct: { emoji: '🔗', label: 'Direct' },
  '(direct)': { emoji: '🔗', label: 'Direct' },
};

function SourceBadge({
  attribution,
}: {
  attribution: import('@/lib/types').AdminPayment['attribution'];
}) {
  if (!attribution || !attribution.source) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const key = attribution.source.toLowerCase();
  // Fallback bazat pe substring pentru variante referrer-style (m.facebook.com,
  // www.google.com, l.instagram.com etc.) care nu apar literal în SOURCE_LABEL.
  const meta =
    SOURCE_LABEL[key] ??
    (key.includes('facebook')
      ? SOURCE_LABEL.facebook
      : key.includes('instagram')
        ? SOURCE_LABEL.instagram
        : key.includes('tiktok')
          ? SOURCE_LABEL.tiktok
          : key.includes('google')
            ? SOURCE_LABEL.google
            : key.includes('youtube')
              ? SOURCE_LABEL.youtube
              : key.includes('whatsapp')
                ? SOURCE_LABEL.whatsapp
                : key.includes('telegram')
                  ? SOURCE_LABEL.telegram
                  : { emoji: '🌐', label: attribution.source });
  // Title detaliat la hover: medium + campaign + referrer + landing path.
  const tooltipParts = [
    `Source: ${attribution.source}`,
    attribution.medium ? `Medium: ${attribution.medium}` : null,
    attribution.campaign ? `Campaign: ${attribution.campaign}` : null,
    attribution.referrer ? `Referrer: ${attribution.referrer}` : null,
    attribution.landingPath ? `Landing: ${attribution.landingPath}` : null,
    attribution.match ? `Match: ${attribution.match}` : null,
  ].filter(Boolean) as string[];
  return (
    <Badge variant="muted" title={tooltipParts.join('\n')} className="whitespace-nowrap">
      <span className="mr-1">{meta.emoji}</span>
      {meta.label}
    </Badge>
  );
}

/**
 * Coloană „Campanie → Creativ": numele campaniei (utm_campaign, cu ID-uri Meta
 * deja traduse în nume de backend) urmat de creativul/ad-ul (utm_content, tradus
 * la ad_spend.adName). „—" când nu există atribuire de campanie.
 */
function CampaignCreativeCell({
  attribution,
}: {
  attribution: import('@/lib/types').AdminPayment['attribution'];
}) {
  const campaign = attribution?.campaignName?.trim() || null;
  const creative = attribution?.creative?.trim() || null;
  if (!campaign && !creative) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const tooltip = [campaign ? `Campanie: ${campaign}` : null, creative ? `Creativ: ${creative}` : null]
    .filter(Boolean)
    .join('\n');
  return (
    <div className="flex items-center gap-1 text-xs max-w-[260px]" title={tooltip}>
      <span className="truncate font-medium text-foreground">{campaign ?? '—'}</span>
      <span className="text-muted-foreground shrink-0">→</span>
      <span className="truncate text-muted-foreground">{creative ?? '—'}</span>
    </div>
  );
}

/**
 * Afișează suma în lei (curs BNR). Pentru plăți în valută arată și suma nativă
 * între paranteze, ca să nu se piardă cât a plătit efectiv clientul.
 */
function moneyRon(p: { amount: number; currency: string; amountRonCents?: number | null }): string {
  const cur = (p.currency || 'RON').toUpperCase();
  if (cur === 'RON') return `${(p.amount / 100).toFixed(2)} lei`;
  if (p.amountRonCents == null) return `${(p.amount / 100).toFixed(2)} ${cur}`;
  return `${(p.amountRonCents / 100).toFixed(2)} lei (${(p.amount / 100).toFixed(2)} ${cur})`;
}

/** Card pentru o plată — varianta mobilă a unui rând din tabel. */
function PaymentCard({
  p,
  showSite,
  onClick,
}: {
  p: import('@/lib/types').AdminPayment;
  showSite: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl border border-border bg-card p-3 active:bg-secondary/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-mono font-semibold tabular-nums">
            {moneyRon(p)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {format(new Date(p.createdAt), "d MMM yyyy 'la' HH:mm", { locale: ro })}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {p.invoice && <InvoiceBadge invoice={p.invoice} />}
          <Badge variant={STATUS_VARIANT[p.status] ?? 'muted'}>{p.status}</Badge>
        </div>
      </div>

      <div className="mt-2 text-xs text-muted-foreground truncate">{p.email ?? '— fără email'}</div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {showSite && <SiteBadge siteId={p.siteId} />}
        <SourceBadge attribution={p.attribution ?? null} />
        {(p.attribution?.campaignName || p.attribution?.creative) && (
          <span className="text-[11px] text-muted-foreground">
            {p.attribution?.campaignName ?? '—'}
            <span className="mx-1">→</span>
            {p.attribution?.creative ?? '—'}
          </span>
        )}
      </div>

      {p.generation && (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <Music2 className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="font-medium truncate">{p.generation.recipientName}</span>
          <Badge
            variant={
              p.generation.status === 'succeeded'
                ? 'success'
                : p.generation.status === 'failed'
                  ? 'destructive'
                  : 'muted'
            }
            className="text-[10px]"
          >
            {p.generation.status}
          </Badge>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="font-mono truncate">{p.ipAddress ?? '— fără IP'}</span>
        <OpenReplayCell sessionId={p.openReplaySessionId} />
      </div>
    </button>
  );
}

const OPENREPLAY_SESSION_BASE = 'https://openreplay.manelecadou.ro/1/session';

/** Link către replay-ul OpenReplay al sesiunii asociate plății (tab nou). */
function OpenReplayCell({ sessionId }: { sessionId?: string | null }) {
  if (!sessionId) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={`${OPENREPLAY_SESSION_BASE}/${sessionId}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 font-mono text-xs text-sky-400 hover:underline max-w-[160px]"
      title={`Vezi replay OpenReplay · sesiune ${sessionId}`}
    >
      <ExternalLink className="h-3 w-3 shrink-0" />
      <span className="truncate">{sessionId}</span>
    </a>
  );
}

/** Badge pentru starea de facturare a unei plăți (coloana „Facturat"). */
function InvoiceBadge({
  invoice,
}: {
  invoice?: { id: string; status: 'issued' | 'failed' } | null;
}) {
  if (!invoice) return <span className="text-muted-foreground">—</span>;
  if (invoice.status === 'failed') return <Badge variant="destructive">eșuat</Badge>;
  return <Badge variant="success">facturat</Badge>;
}

export default function PaymentsPage() {
  const { isAllSelected } = useSitesMap();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Filtre — sincronizate cu URL prin search params? Nu acum (overkill).
  // Toate sunt resetate când userul schimbă site-ul din selectorul global.
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(0);

  // Debounce pe input search ca să nu spam-uim API-ul la fiecare tastă.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Reset pagină când se schimbă orice filtru — altfel poți fi pe pagina 5
  // pentru un filtru care are doar 2 rezultate.
  useEffect(() => {
    setPage(0);
  }, [status, source, debouncedSearch, pageSize]);

  const params = useMemo(
    () => ({
      limit: pageSize,
      offset: page * pageSize,
      status,
      source,
      search: debouncedSearch || undefined,
    }),
    [pageSize, page, status, source, debouncedSearch],
  );

  const { data, loading: isLoading } = useAsync(
    () => AdminApi.payments(params),
    [params],
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters =
    status !== 'all' || source !== 'all' || debouncedSearch.length > 0;

  function resetFilters() {
    setStatus('all');
    setSource('all');
    setSearch('');
  }

  return (
    <div>
      <PageHeader title="Plăți" description="Toate tranzacțiile (Stripe + alți provideri)" />

      {/* Toolbar filtre */}
      <div className="flex flex-wrap items-end gap-3 mb-4 p-3 rounded-md border border-white/10 bg-white/[0.02]">
        <div className="flex-1 min-w-[220px]">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 block">
            Caută email
          </Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ex. ion@gmail.com"
              className="pl-8"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Șterge"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="min-w-[180px]">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 block">
            Status
          </Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[180px]">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 block">
            Sursă
          </Label>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[110px]">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 block">
            Per pagină
          </Label>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => setPageSize(parseInt(v, 10))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <X className="h-3.5 w-3.5 mr-1" />
            Resetează
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : items.length === 0 ? (
        <Empty
          icon={<CreditCard className="h-5 w-5" />}
          title={hasFilters ? 'Niciun rezultat pentru filtrele alese' : 'Nicio plată încă'}
          description={hasFilters ? 'Încearcă să resetezi filtrele.' : undefined}
        />
      ) : (
        <>
        {/* Mobil: carduri */}
        <div className="md:hidden space-y-2.5">
          {items.map((p) => (
            <PaymentCard
              key={p.id}
              p={p}
              showSite={isAllSelected}
              onClick={() => setSelectedId(p.id)}
            />
          ))}
        </div>
        {/* Desktop: tabel */}
        <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              {isAllSelected && <TableHead>Site</TableHead>}
              <TableHead>IP</TableHead>
              <TableHead className="text-right">Sumă</TableHead>
              <TableHead className="w-[110px]">Status</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Sursă</TableHead>
              <TableHead>Campanie → Creativ</TableHead>
              <TableHead>OpenReplay</TableHead>
              <TableHead>Comandă</TableHead>
              <TableHead>Facturat</TableHead>
              <TableHead>ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((p) => (
              <TableRow
                key={p.id}
                className="cursor-pointer hover:bg-white/5"
                onClick={() => setSelectedId(p.id)}
              >
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(p.createdAt), "d MMM yyyy 'la' HH:mm", { locale: ro })}
                </TableCell>
                {isAllSelected && (
                  <TableCell>
                    <SiteBadge siteId={p.siteId} />
                  </TableCell>
                )}
                <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {p.ipAddress ?? '—'}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {moneyRon(p)}
                </TableCell>
                <TableCell className="w-[110px]">
                  <Badge
                    variant={STATUS_VARIANT[p.status] ?? 'muted'}
                    title={
                      p.status === 'failed' && (p.failureReason || p.failureCode)
                        ? `${p.failureCode ?? ''}${p.failureCode && p.failureReason ? ' — ' : ''}${p.failureReason ?? ''}`
                        : undefined
                    }
                  >
                    {p.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">
                  {p.email ?? '—'}
                </TableCell>
                <TableCell>
                  <SourceBadge attribution={p.attribution ?? null} />
                </TableCell>
                <TableCell>
                  <CampaignCreativeCell attribution={p.attribution ?? null} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <OpenReplayCell sessionId={p.openReplaySessionId} />
                </TableCell>
                <TableCell className="text-xs">
                  {p.generation ? (
                    <a
                      href={`/m/${p.generation.id}`}
                      target="_blank"
                      rel="noopener"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex flex-col items-start gap-0.5 hover:underline"
                      title={`Generation ${p.generation.id} · ${p.generation.status}`}
                    >
                      <span className="inline-flex items-center gap-1 font-medium">
                        <Music2 className="h-3 w-3" />
                        {p.generation.recipientName}
                      </span>
                      <span className="flex items-center gap-1 text-[10px]">
                        <Badge
                          variant={
                            p.generation.status === 'succeeded'
                              ? 'success'
                              : p.generation.status === 'failed'
                                ? 'destructive'
                                : 'muted'
                          }
                          className="text-[10px]"
                        >
                          {p.generation.status}
                        </Badge>
                        {p.generation.status === 'failed' && p.generation.nextRetryAt && (
                          <span className="text-amber-300">⏱ retry</span>
                        )}
                        {p.generation.paidUnlocked && (
                          <Badge variant="success" className="text-[10px]">paid</Badge>
                        )}
                      </span>
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <InvoiceBadge invoice={p.invoice} />
                </TableCell>
                <TableCell>
                  <code className="text-xs text-muted-foreground">{p.id.slice(0, 8)}</code>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
        </>
      )}

      {/* Paginare jos — vizibilă chiar și când e o singură pagină ca să fie clar
          câte rezultate avem. */}
      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between gap-3 mt-3 text-xs text-muted-foreground">
          <div>
            {total === 1
              ? '1 rezultat'
              : `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, total)} din ${total} rezultate`}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Înapoi
              </Button>
              <span className="text-xs whitespace-nowrap">
                Pagina <b className="text-foreground">{page + 1}</b> din {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Înainte
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}

      {selectedId && <OrderDetailModal id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
