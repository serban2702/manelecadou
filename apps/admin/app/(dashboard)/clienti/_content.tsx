'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { Check, Loader2, RotateCcw, Search, Users, X } from 'lucide-react';
import {
  BillingCustomersApi,
  type BillingCustomerRow,
  type BillingCustomerPatch,
} from '@/lib/api/billing-customers.api';
import { useAsync } from '@/lib/hooks/use-async';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { CountySelect } from '@/components/county-select';

const PAGE_SIZE_OPTIONS = [20, 50, 100];

function money(cents: number, currency = 'RON'): string {
  return new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency: currency || 'RON',
    maximumFractionDigits: 0,
  }).format((cents || 0) / 100);
}

function rowKey(r: { siteId: string | null; email: string }): string {
  return `${r.siteId}|${r.email}`;
}

type SaveStatus = 'saving' | 'saved' | 'error';

export default function ClientiPage() {
  const { toast } = useToast();
  const { isAllSelected } = useSitesMap();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, pageSize]);

  const params = useMemo(
    () => ({
      limit: pageSize,
      offset: page * pageSize,
      search: debouncedSearch || undefined,
    }),
    [pageSize, page, debouncedSearch],
  );

  const { data, loading, refetch } = useAsync(
    () => BillingCustomersApi.list(params),
    [params],
  );

  // Copie locală editabilă a rândurilor (update optimist la autosave).
  const [rows, setRows] = useState<BillingCustomerRow[]>([]);
  const rowsRef = useRef<BillingCustomerRow[]>([]);
  rowsRef.current = rows;
  useEffect(() => {
    if (data?.items) setRows(data.items);
  }, [data]);

  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const clearTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function setStatus(key: string, status: SaveStatus | null) {
    setSaveStatus((s) => {
      const next = { ...s };
      if (status === null) delete next[key];
      else next[key] = status;
      return next;
    });
  }

  async function commit(row: BillingCustomerRow, patch: BillingCustomerPatch) {
    if (!row.siteId) {
      toast({
        variant: 'destructive',
        title: 'Client fără site',
        description: 'Nu pot salva un client care nu are un site asociat.',
      });
      return;
    }
    const key = rowKey(row);
    const prev = rowsRef.current.find((r) => rowKey(r) === key);
    // Update optimist.
    setRows((rs) =>
      rs.map((r) => (rowKey(r) === key ? { ...r, ...patch, saved: true } : r)),
    );
    setStatus(key, 'saving');
    try {
      const saved = await BillingCustomersApi.upsert(row.siteId, row.email, patch);
      setRows((rs) =>
        rs.map((r) =>
          rowKey(r) === key ? { ...r, savedId: saved.id, saved: true } : r,
        ),
      );
      setStatus(key, 'saved');
      clearTimeout(clearTimers.current[key]);
      clearTimers.current[key] = setTimeout(() => setStatus(key, null), 1600);
    } catch (e) {
      // Revert la valoarea de dinainte.
      if (prev) setRows((rs) => rs.map((r) => (rowKey(r) === key ? prev : r)));
      setStatus(key, 'error');
      toast({
        variant: 'destructive',
        title: 'Salvare eșuată',
        description: (e as Error).message,
      });
    }
  }

  async function resetRow(row: BillingCustomerRow) {
    if (!row.savedId) return;
    try {
      await BillingCustomersApi.reset(row.savedId);
      toast({ variant: 'success', title: 'Client resetat la datele din plăți' });
      refetch();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Eroare',
        description: (e as Error).message,
      });
    }
  }

  const colSpan = isAllSelected ? 13 : 12;

  return (
    <div>
      <PageHeader
        title="Clienți"
        description="Datele de facturare per client. Editezi direct în tabel — se salvează automat și se aplică la toate facturile lui viitoare. Facturile deja emise nu se schimbă."
      />

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border border-white/10 bg-white/[0.02] p-3">
        <div className="min-w-[240px] flex-1">
          <Label className="mb-1.5 block text-[10px] uppercase tracking-wide text-muted-foreground">
            Caută (email sau nume)
          </Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ex. ion@gmail.com sau Ion Popescu"
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
        <div className="min-w-[110px]">
          <Label className="mb-1.5 block text-[10px] uppercase tracking-wide text-muted-foreground">
            Per pagină
          </Label>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(parseInt(v, 10))}>
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
      </div>

      {loading && rows.length === 0 ? (
        <Skeleton className="h-96 w-full" />
      ) : rows.length === 0 ? (
        <Empty
          icon={<Users className="h-5 w-5" />}
          title="Niciun client"
          description={
            debouncedSearch
              ? 'Niciun client nu se potrivește căutării.'
              : 'Clienții apar aici după ce ai plăți înregistrate.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Client</TableHead>
                {isAllSelected && <TableHead>Site</TableHead>}
                <TableHead className="min-w-[160px]">Nume / Denumire</TableHead>
                <TableHead className="min-w-[130px]">CUI / CNP</TableHead>
                <TableHead className="min-w-[120px]">Reg. Com.</TableHead>
                <TableHead className="min-w-[180px]">Adresă</TableHead>
                <TableHead className="min-w-[120px]">Oraș</TableHead>
                <TableHead className="min-w-[150px]">Județ</TableHead>
                <TableHead className="min-w-[100px]">Țară</TableHead>
                <TableHead className="text-center">TVA</TableHead>
                <TableHead className="whitespace-nowrap text-right">Comenzi</TableHead>
                <TableHead className="whitespace-nowrap text-right">Total plătit</TableHead>
                <TableHead className="whitespace-nowrap">Ultima</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const key = rowKey(r);
                const status = saveStatus[key];
                const editable = !!r.siteId;
                return (
                  <TableRow key={key} className={cn(r.saved && 'bg-primary/[0.04]')}>
                    {/* Client (identitate) */}
                    <TableCell className="align-top">
                      <div className="flex items-start gap-1.5">
                        {r.saved ? (
                          <span
                            className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                            title="Profil salvat manual"
                          />
                        ) : (
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-transparent" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium">{r.email}</div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>{r.invoicesCount} facturi</span>
                            <SaveIndicator status={status} />
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {isAllSelected && (
                      <TableCell className="align-top">
                        <SiteBadge siteId={r.siteId} />
                      </TableCell>
                    )}

                    <TableCell className="align-top">
                      <EditableCell
                        value={r.name}
                        disabled={!editable}
                        placeholder="Nume complet"
                        onCommit={(v) => commit(r, { name: v })}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <EditableCell
                        value={r.vatCode}
                        disabled={!editable}
                        placeholder="—"
                        mono
                        onCommit={(v) => commit(r, { vatCode: v })}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <EditableCell
                        value={r.regCom}
                        disabled={!editable}
                        placeholder="—"
                        mono
                        onCommit={(v) => commit(r, { regCom: v })}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <EditableCell
                        value={r.address}
                        disabled={!editable}
                        placeholder="Stradă, nr."
                        onCommit={(v) => commit(r, { address: v })}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <EditableCell
                        value={r.city}
                        disabled={!editable}
                        placeholder="Oraș"
                        onCommit={(v) => commit(r, { city: v })}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <CountySelect
                        value={r.county ?? ''}
                        showLabel={false}
                        className="h-8 border-transparent bg-transparent text-xs hover:border-border data-[state=open]:border-border"
                        onChange={(v) => commit(r, { county: v })}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <EditableCell
                        value={r.country}
                        disabled={!editable}
                        placeholder="Romania"
                        onCommit={(v) => commit(r, { country: v })}
                      />
                    </TableCell>
                    <TableCell className="text-center align-middle">
                      <Switch
                        checked={r.isTaxPayer}
                        disabled={!editable}
                        onCheckedChange={(v) => commit(r, { isTaxPayer: v })}
                        aria-label="Plătitor de TVA"
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right align-middle text-xs">
                      {r.ordersPaid}
                      {r.ordersTotal > r.ordersPaid && (
                        <span className="text-muted-foreground"> / {r.ordersTotal}</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right align-middle font-medium tabular-nums">
                      {money(r.paidTotalRonCents)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-middle text-[11px] text-muted-foreground">
                      {r.lastOrderAt
                        ? format(new Date(r.lastOrderAt), 'd MMM yyyy', { locale: ro })
                        : '—'}
                    </TableCell>
                    <TableCell className="align-middle">
                      {r.saved && r.savedId && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => resetRow(r)}
                          title="Resetează la datele din plăți (șterge profilul salvat)"
                          aria-label="Resetează client"
                        >
                          <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Paginare */}
      {rows.length > 0 && (
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} din {total} clienți
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ← Înapoi
            </Button>
            <span>
              Pagina <b className="text-foreground">{page + 1}</b> din {totalPages}
            </span>
            <Button
              variant="outline"
              size="xs"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Înainte →
            </Button>
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Un client = același email pe același site. Editează orice câmp direct în celulă
        (<kbd className="rounded border border-border px-1 py-0.5">Enter</kbd> salvează,{' '}
        <kbd className="rounded border border-border px-1 py-0.5">Esc</kbd> anulează) — se salvează
        automat. Datele salvate au prioritate la emiterea facturilor. Butonul{' '}
        <RotateCcw className="inline h-3 w-3" /> șterge profilul salvat și revine la datele din plăți.
      </p>
    </div>
  );
}

function SaveIndicator({ status }: { status?: SaveStatus }) {
  if (status === 'saving')
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> salvez…
      </span>
    );
  if (status === 'saved')
    return (
      <span className="inline-flex items-center gap-1 text-emerald-500">
        <Check className="h-3 w-3" /> salvat
      </span>
    );
  if (status === 'error')
    return <span className="text-destructive">eroare</span>;
  return null;
}

function EditableCell({
  value,
  onCommit,
  placeholder,
  disabled,
  mono,
}: {
  value: string | null;
  onCommit: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  mono?: boolean;
}) {
  const [draft, setDraft] = useState(value ?? '');
  // Re-sincronizează doar când valoarea committed se schimbă din exterior
  // (nu la fiecare tastă — dep-ul e `value`, nu `draft`).
  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  return (
    <Input
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if ((draft ?? '') !== (value ?? '')) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setDraft(value ?? '');
          // blur pe frame-ul următor ca să nu declanșeze onBlur cu draft vechi
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
      className={cn(
        'h-8 border-transparent bg-transparent px-2 text-xs hover:border-border focus:border-border focus:bg-background',
        mono && 'font-mono',
      )}
    />
  );
}
