'use client';

import { useEffect, useRef, useState } from 'react';
import { useAsync } from '@/lib/hooks/use-async';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { Download, FileText, Receipt, Trash2 } from 'lucide-react';
import {
  InvoicesApi,
  type BillablePayment,
  type BulkEmitJob,
  type EmitOverrides,
  type InvoiceClientData,
  type InvoiceDto,
  type InvoicePreview,
} from '@/lib/api/invoices.api';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { SiteBadge } from '@/components/site-badge';
import { useSitesMap } from '@/lib/hooks/use-sites-map';
import { CountySelect } from '@/components/county-select';
import { BillingCustomersApi } from '@/lib/api/billing-customers.api';
import { EditableCell, SaveIndicator, type SaveStatus } from '@/components/inline-edit';

const BILL_PAGE_SIZE = 50;

/** Tipuri de plată uzuale acceptate de SmartBill pe încasare. „Card online" e default-ul
 *  (plățile vin din Stripe). */
const PAYMENT_TYPES = ['Card online', 'Card', 'Ordin de plata', 'Transfer bancar', 'Chitanta', 'Numerar', 'Mandat postal'];
const DEFAULT_PAYMENT_TYPE = 'Card online';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('ro-RO', { style: 'currency', currency: currency || 'RON' }).format(
    cents / 100,
  );
}

/**
 * Selecție pe rânduri cu suport shift+click (range select). Ține un „anchor"
 * (ultimul rând click-uit); la shift+click selectează/deselectează tot intervalul
 * dintre anchor și rândul curent, sărind peste rândurile ne-selectabile. `toggle`
 * se leagă de `onClick` pe checkbox (nu `onCheckedChange`) ca să avem `shiftKey`.
 */
function useRangeSelect<T>(
  items: T[],
  idOf: (item: T) => string,
  isSelectable: (item: T) => boolean = () => true,
) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchorRef = useRef<number | null>(null);

  const selectableIds = items.filter(isSelectable).map(idOf);
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggle = (index: number, shiftKey: boolean) => {
    const item = items[index];
    if (!item || !isSelectable(item)) return;
    const id = idOf(item);
    setSelected((prev) => {
      const next = new Set(prev);
      if (shiftKey && anchorRef.current !== null) {
        const from = Math.min(anchorRef.current, index);
        const to = Math.max(anchorRef.current, index);
        const shouldSelect = !prev.has(id);
        for (let i = from; i <= to; i += 1) {
          const it = items[i];
          if (!it || !isSelectable(it)) continue;
          if (shouldSelect) next.add(idOf(it));
          else next.delete(idOf(it));
        }
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    anchorRef.current = index;
  };

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableIds));
  const clear = () => {
    setSelected(new Set());
    anchorRef.current = null;
  };
  const remove = (id: string) =>
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  return { selected, selectableIds, allSelected, toggle, toggleAll, clear, remove };
}

export default function FacturarePage() {
  const { toast } = useToast();
  const { isAllSelected } = useSitesMap();

  // Datele de facturare se citesc acum din coloanele plății (adresa Stripe
  // persistată la webhook/backfill), nu se mai interoghează Stripe per rând.
  const billable = useAsync(() => InvoicesApi.billable(), []);
  const issued = useAsync(() => InvoicesApi.issued(), [], { refetchInterval: 30_000 });

  // Copie locală editabilă a rândurilor de facturat (autosave inline pe client).
  const [rows, setRows] = useState<BillablePayment[]>([]);
  const rowsRef = useRef<BillablePayment[]>([]);
  rowsRef.current = rows;
  useEffect(() => {
    if (billable.data) setRows(billable.data);
  }, [billable.data]);

  const issuedRows = issued.data ?? [];

  // Paginare client-side (lista e acum rapidă, dar 200+ rânduri cu input-uri = DOM greu).
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(rows.length / BILL_PAGE_SIZE));
  const pageRows = rows.slice(page * BILL_PAGE_SIZE, page * BILL_PAGE_SIZE + BILL_PAGE_SIZE);
  useEffect(() => {
    if (page > 0 && page >= totalPages) setPage(0);
  }, [page, totalPages]);

  const billSel = useRangeSelect<BillablePayment>(
    pageRows,
    (r) => r.paymentId,
    (r) => r.smartbillReady,
  );
  const invSel = useRangeSelect<InvoiceDto>(issuedRows, (inv) => inv.id);

  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [saveByEmail, setSaveByEmail] = useState<Record<string, SaveStatus>>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const selectedRows = rows.filter((r) => billSel.selected.has(r.paymentId));

  const refetchAll = () => {
    billable.refetch();
    issued.refetch();
  };

  // Salvează un câmp de client (identificat prin email) pe profilul de facturare.
  // Se aplică la TOATE rândurile aceluiași email (comenzi nefacturate) + persistă
  // pentru /clienti și facturile viitoare.
  async function commitClient(row: BillablePayment, patch: Partial<InvoiceClientData>) {
    const email = row.buyerEmail;
    if (!email || !row.siteId) {
      toast({
        variant: 'destructive',
        title: 'Nu pot salva',
        description: 'Plata nu are email sau site asociat.',
      });
      return;
    }
    const prev = rowsRef.current;
    setRows((rs) =>
      rs.map((r) =>
        r.buyerEmail === email ? { ...r, client: { ...(r.client ?? {}), ...patch } } : r,
      ),
    );
    setSaveByEmail((s) => ({ ...s, [email]: 'saving' }));
    try {
      await BillingCustomersApi.upsert(row.siteId, email, patch);
      setSaveByEmail((s) => ({ ...s, [email]: 'saved' }));
      clearTimeout(saveTimers.current[email]);
      saveTimers.current[email] = setTimeout(
        () => setSaveByEmail((s) => { const n = { ...s }; delete n[email]; return n; }),
        1600,
      );
    } catch (e) {
      setRows(prev);
      setSaveByEmail((s) => ({ ...s, [email]: 'error' }));
      toast({ variant: 'destructive', title: 'Salvare eșuată', description: (e as Error).message });
    }
  }

  async function deleteBulk() {
    const ids = [...invSel.selected];
    if (ids.length === 0) return;
    const ok = await confirmDialog({
      title: `Ștergi ${ids.length} ${ids.length === 1 ? 'factură' : 'facturi'}?`,
      description:
        'Se șterg DOAR din aplicație (rândul + PDF-ul local). NU se stornează în SmartBill. Plata redevine facturabilă și poate fi re-emisă.',
      confirmText: 'Șterge definitiv',
      variant: 'destructive',
    });
    if (!ok) return;
    setDelBusy(true);
    try {
      const res = await InvoicesApi.removeBulk(ids);
      toast({
        variant: res.errors.length ? 'destructive' : 'success',
        title: `${res.deleted} șterse${res.errors.length ? `, ${res.errors.length} eșuate` : ''}`,
        description: res.errors.length
          ? res.errors.map((e) => e.error).slice(0, 3).join(' | ')
          : undefined,
      });
      invSel.clear();
      refetchAll();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    } finally {
      setDelBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Facturare (SmartBill)"
        description="Emite manual facturile pentru plăți. Firmă neplătitoare de TVA (cotă 0%). Configurează credențialele în „Acest site” → Facturare."
      />

      <Tabs defaultValue="billable">
        <TabsList>
          <TabsTrigger value="billable">De facturat ({rows.length})</TabsTrigger>
          <TabsTrigger value="issued">Emise ({issuedRows.length})</TabsTrigger>
        </TabsList>

        {/* ───────── De facturat ───────── */}
        <TabsContent value="billable">
          {billSel.selected.size > 0 && (
            <div className="flex items-center gap-3 mb-3 p-3 rounded-md border border-border bg-secondary/20">
              <span className="text-sm">{billSel.selected.size} selectate</span>
              <Button size="sm" onClick={() => setBulkOpen(true)}>
                Emite selectate…
              </Button>
              <Button size="sm" variant="ghost" onClick={billSel.clear}>
                Anulează
              </Button>
            </div>
          )}

          {billable.loading ? (
            <Skeleton className="h-72 w-full" />
          ) : (billable.data?.length ?? 0) === 0 ? (
            <Empty
              icon={<Receipt className="h-5 w-5" />}
              title="Nimic de facturat"
              description="Toate plățile finalizate au fost facturate (sau nu există plăți > 0)."
            />
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={billSel.allSelected}
                          onCheckedChange={billSel.toggleAll}
                          aria-label="Selectează tot"
                        />
                      </TableHead>
                      <TableHead className="whitespace-nowrap">Data</TableHead>
                      {isAllSelected && <TableHead>Site</TableHead>}
                      <TableHead className="min-w-[180px]">Cumpărător</TableHead>
                      <TableHead className="min-w-[150px]">Nume / Denumire</TableHead>
                      <TableHead className="min-w-[120px]">CUI / CNP</TableHead>
                      <TableHead className="min-w-[160px]">Adresă</TableHead>
                      <TableHead className="min-w-[110px]">Oraș</TableHead>
                      <TableHead className="min-w-[140px]">Județ</TableHead>
                      <TableHead className="min-w-[100px]">Țară</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Sumă</TableHead>
                      <TableHead>Facturat</TableHead>
                      <TableHead className="text-right">Acțiuni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((r, idx) => {
                      const c = r.client ?? {};
                      const status = r.buyerEmail ? saveByEmail[r.buyerEmail] : undefined;
                      return (
                        <TableRow
                          key={r.paymentId}
                          data-state={billSel.selected.has(r.paymentId) ? 'selected' : undefined}
                        >
                          <TableCell className="align-top">
                            <Checkbox
                              checked={billSel.selected.has(r.paymentId)}
                              disabled={!r.smartbillReady}
                              onClick={(e) => billSel.toggle(idx, e.shiftKey)}
                              aria-label="Selectează"
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap align-top text-[11px] text-muted-foreground">
                            {format(new Date(r.createdAt), 'd MMM yyyy', { locale: ro })}
                          </TableCell>
                          {isAllSelected && (
                            <TableCell className="align-top">
                              <SiteBadge siteId={r.siteId} />
                            </TableCell>
                          )}
                          <TableCell className="align-top text-xs">
                            <div className="truncate">{r.buyerEmail ?? '—'}</div>
                            <div className="text-[10px] text-muted-foreground">
                              <SaveIndicator status={status} />
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <EditableCell
                              value={c.name ?? r.buyerName ?? ''}
                              placeholder="Nume complet"
                              onCommit={(v) => commitClient(r, { name: v })}
                            />
                          </TableCell>
                          <TableCell className="align-top">
                            <EditableCell
                              value={c.vatCode ?? ''}
                              placeholder="—"
                              mono
                              onCommit={(v) => commitClient(r, { vatCode: v })}
                            />
                          </TableCell>
                          <TableCell className="align-top">
                            <EditableCell
                              value={c.address ?? ''}
                              placeholder="Stradă, nr."
                              onCommit={(v) => commitClient(r, { address: v })}
                            />
                          </TableCell>
                          <TableCell className="align-top">
                            <EditableCell
                              value={c.city ?? ''}
                              placeholder="Oraș"
                              onCommit={(v) => commitClient(r, { city: v })}
                            />
                          </TableCell>
                          <TableCell className="align-top">
                            <CountySelect
                              value={c.county ?? ''}
                              showLabel={false}
                              className="h-8 border-transparent bg-transparent text-xs hover:border-border data-[state=open]:border-border"
                              onChange={(v) => commitClient(r, { county: v })}
                            />
                          </TableCell>
                          <TableCell className="align-top">
                            <EditableCell
                              value={c.country ?? ''}
                              placeholder="Romania"
                              onCommit={(v) => commitClient(r, { country: v })}
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right align-middle font-medium tabular-nums">
                            {money(r.amountCents, r.currency)}
                          </TableCell>
                          <TableCell className="align-middle">
                            {r.invoiceStatus === 'failed' ? (
                              <Badge variant="destructive" title="O emitere anterioară a eșuat">
                                eșuat
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right align-middle">
                            <Button
                              variant="outline"
                              size="xs"
                              disabled={!r.smartbillReady}
                              onClick={() => setPreviewFor(r.paymentId)}
                            >
                              Emite
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    {page * BILL_PAGE_SIZE + 1}–{Math.min((page + 1) * BILL_PAGE_SIZE, rows.length)} din{' '}
                    {rows.length}
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

              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                Editează datele clientului direct în tabel — se salvează automat pe client (după email)
                și se aplică la toate comenzile lui nefacturate + la pagina Clienți. Ține{' '}
                <kbd className="rounded border border-border px-1 py-0.5">Shift</kbd> apăsat la click pe o
                bifă pentru selecție în interval; „Emite selectate…” deschide modalul de emitere.
              </p>
            </>
          )}
        </TabsContent>

        {/* ───────── Emise ───────── */}
        <TabsContent value="issued">
          {invSel.selected.size > 0 && (
            <div className="flex items-center gap-3 mb-3 p-3 rounded-md border border-destructive/30 bg-destructive/10">
              <span className="text-sm">{invSel.selected.size} selectate</span>
              <Button size="sm" variant="destructive" onClick={deleteBulk} disabled={delBusy}>
                {delBusy ? 'Se șterg…' : 'Șterge selectate'}
              </Button>
              <Button size="sm" variant="ghost" onClick={invSel.clear} disabled={delBusy}>
                Anulează
              </Button>
            </div>
          )}

          {issued.loading ? (
            <Skeleton className="h-72 w-full" />
          ) : issuedRows.length === 0 ? (
            <Empty
              icon={<FileText className="h-5 w-5" />}
              title="Nicio factură emisă"
              description="Facturile emise apar aici cu serie, număr și PDF."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={invSel.allSelected}
                        onCheckedChange={invSel.toggleAll}
                        aria-label="Selectează tot"
                      />
                    </TableHead>
                    <TableHead>Serie / Număr</TableHead>
                    {isAllSelected && <TableHead>Site</TableHead>}
                    <TableHead>Client</TableHead>
                    <TableHead>Sumă</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Acțiuni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issuedRows.map((inv, idx) => (
                    <IssuedRow
                      key={inv.id}
                      inv={inv}
                      showSite={isAllSelected}
                      checked={invSel.selected.has(inv.id)}
                      onToggle={(shiftKey) => invSel.toggle(idx, shiftKey)}
                      onDeleted={() => {
                        invSel.remove(inv.id);
                        refetchAll();
                      }}
                    />
                  ))}
                </TableBody>
              </Table>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Ștergerea e doar locală (rând + PDF) — nu emite storno în SmartBill. Folosește
                <kbd className="mx-1 rounded border border-border px-1 py-0.5">Shift</kbd>+click pentru
                selecție în interval.
              </p>
            </>
          )}
        </TabsContent>
      </Tabs>

      {bulkOpen && selectedRows.length > 0 && (
        <BulkEmitDialog
          rows={selectedRows}
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            setBulkOpen(false);
            billSel.clear();
            refetchAll();
          }}
        />
      )}

      {previewFor && (
        <PreviewDialog
          paymentId={previewFor}
          onClose={() => setPreviewFor(null)}
          onEmitted={() => {
            setPreviewFor(null);
            billSel.remove(previewFor);
            refetchAll();
          }}
        />
      )}
    </div>
  );
}

function BulkEmitDialog({
  rows,
  onClose,
  onDone,
}: {
  rows: BillablePayment[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [issueDate, setIssueDate] = useState(todayIso());
  const [paymentType, setPaymentType] = useState(DEFAULT_PAYMENT_TYPE);
  const [clients, setClients] = useState<Record<string, InvoiceClientData>>(() =>
    Object.fromEntries(rows.map((r) => [r.paymentId, { ...(r.client ?? {}) }])),
  );
  const [emitting, setEmitting] = useState(false);
  const [saveToClients, setSaveToClients] = useState(true);
  // Job async de emitere + progres (polling). Null = încă la formular.
  const [progress, setProgress] = useState<BulkEmitJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    },
    [],
  );

  const patch = (pid: string, p: Partial<InvoiceClientData>) =>
    setClients((c) => ({ ...c, [pid]: { ...c[pid], ...p } }));

  function startPolling(jobId: string) {
    let errors = 0;
    const tick = async () => {
      if (cancelledRef.current) return;
      try {
        const job = await InvoicesApi.emitBulkStatus(jobId);
        errors = 0;
        if (cancelledRef.current) return;
        setProgress(job);
        if (job.status === 'done') {
          setEmitting(false);
          toast({
            variant: job.failed ? 'destructive' : 'success',
            title: `${job.ok} emise${job.failed ? `, ${job.failed} eșuate` : ''} din ${job.total}`,
            description: job.failed
              ? job.results.filter((r) => !r.ok).map((r) => r.error).slice(0, 3).join(' | ')
              : undefined,
          });
          return; // stop polling
        }
      } catch {
        errors += 1;
        if (errors >= 5) {
          setEmitting(false);
          toast({
            variant: 'destructive',
            title: 'Am pierdut legătura cu jobul',
            description: 'Emiterea poate continua pe server. Reîmprospătează lista.',
          });
          return;
        }
      }
      pollRef.current = setTimeout(tick, 1500);
    };
    void tick();
  }

  async function emitAll() {
    const missing = rows.filter((r) => !clients[r.paymentId]?.name?.trim());
    if (missing.length) {
      toast({
        variant: 'destructive',
        title: `Nume client lipsă la ${missing.length} ${missing.length === 1 ? 'factură' : 'facturi'}`,
        description: 'Completează numele/denumirea pentru fiecare client înainte de emitere.',
      });
      return;
    }
    setEmitting(true);
    try {
      const overrides: Record<string, EmitOverrides> = {};
      for (const r of rows) {
        overrides[r.paymentId] = { client: clients[r.paymentId], issueDate, paymentType };
      }
      // Salvează profilele clienților (best-effort, în paralel cu emiterea).
      if (saveToClients) {
        void Promise.all(
          rows
            .filter((r) => r.buyerEmail && r.siteId)
            .map((r) => {
              const c = clients[r.paymentId] ?? {};
              return BillingCustomersApi.upsert(r.siteId!, r.buyerEmail!, {
                name: c.name,
                vatCode: c.vatCode,
                regCom: c.regCom,
                address: c.address,
                city: c.city,
                county: c.county,
                country: c.country,
                isTaxPayer: c.isTaxPayer,
              }).catch(() => undefined);
            }),
        );
      }
      const { jobId, total } = await InvoicesApi.emitBulk(
        rows.map((r) => r.paymentId),
        overrides,
      );
      setProgress({
        id: jobId,
        total,
        done: 0,
        ok: 0,
        failed: 0,
        status: 'running',
        results: [],
        startedAt: Date.now(),
        finishedAt: null,
      });
      startPolling(jobId);
    } catch (e) {
      setEmitting(false);
      toast({ variant: 'destructive', title: 'Eroare la pornire', description: (e as Error).message });
    }
  }

  const running = !!progress && progress.status === 'running';
  const finished = !!progress && progress.status === 'done';

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        // Cât timp rulează, nu închidem accidental (Escape / click în afară).
        if (!o && !running) (finished ? onDone : onClose)();
      }}
    >
      <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle>
            Emite {rows.length} {rows.length === 1 ? 'factură' : 'facturi'}
          </DialogTitle>
          <DialogDescription>
            {progress
              ? 'Emiterea rulează pe server, factură cu factură. Poți lăsa fereastra deschisă — progresul se actualizează singur.'
              : 'Data și metoda de plată se aplică tuturor. Verifică/editează datele fiecărui client — județul e în formatul cerut de SmartBill.'}
          </DialogDescription>
        </DialogHeader>

        {progress ? (
          <BulkProgress progress={progress} rows={rows} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 border-b border-border pb-3">
              <div className="space-y-1">
                <Label className="text-xs">Data emiterii (apare pe factură)</Label>
                <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Metoda de plată</Label>
                <Select value={paymentType} onValueChange={setPaymentType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <label className="flex cursor-pointer select-none items-center gap-2 border-b border-border pb-3 text-xs text-muted-foreground">
              <Checkbox checked={saveToClients} onCheckedChange={(v) => setSaveToClients(!!v)} />
              Salvează datele pe fiecare client (se aplică la facturile lor viitoare)
            </label>

            <div className="-mr-1 flex-1 space-y-3 overflow-y-auto pr-1">
              {rows.map((r) => {
                const c = clients[r.paymentId] ?? {};
                return (
                  <div key={r.paymentId} className="rounded-lg border border-border bg-secondary/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">
                        {format(new Date(r.createdAt), 'd MMM yyyy', { locale: ro })} · {r.buyerEmail ?? '—'}
                      </span>
                      <span className="tabular-nums font-medium text-foreground">
                        {money(r.amountCents, r.currency)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Nume / Denumire *</Label>
                        <Input
                          value={c.name ?? ''}
                          onChange={(e) => patch(r.paymentId, { name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Adresă</Label>
                        <Input
                          value={c.address ?? ''}
                          onChange={(e) => patch(r.paymentId, { address: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Oraș</Label>
                        <Input
                          value={c.city ?? ''}
                          onChange={(e) => patch(r.paymentId, { city: e.target.value })}
                        />
                      </div>
                      <CountySelect value={c.county} onChange={(v) => patch(r.paymentId, { county: v })} />
                      <div className="space-y-1">
                        <Label className="text-xs">Țară</Label>
                        <Input
                          value={c.country ?? ''}
                          onChange={(e) => patch(r.paymentId, { country: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <DialogFooter className="border-t border-border pt-3">
          {finished ? (
            <Button onClick={onDone}>Închide</Button>
          ) : running ? (
            <Button variant="ghost" onClick={onClose}>
              Lasă în fundal
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Renunță
              </Button>
              <Button onClick={emitAll} disabled={emitting}>
                {emitting ? 'Se pornește…' : `Emite toate (${rows.length})`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Panoul de progres pentru emiterea în bloc (live + sumar la final). */
function BulkProgress({ progress, rows }: { progress: BulkEmitJob; rows: BillablePayment[] }) {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const emailByPid = new Map(rows.map((r) => [r.paymentId, r.buyerEmail ?? r.paymentId]));
  const errors = progress.results.filter((r) => !r.ok);
  return (
    <div className="flex-1 space-y-4 overflow-y-auto py-2">
      <div className="flex items-baseline justify-between">
        <div className="text-2xl font-semibold tabular-nums">
          {progress.done} <span className="text-base font-normal text-muted-foreground">/ {progress.total}</span>
        </div>
        <div className="text-sm">
          <span className="text-emerald-500">{progress.ok} emise</span>
          {progress.failed > 0 && <span className="text-destructive"> · {progress.failed} eșuate</span>}
        </div>
      </div>

      <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            progress.failed > 0 ? 'bg-amber-500' : 'bg-primary',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="text-xs text-muted-foreground">
        {progress.status === 'running'
          ? `Se emit facturile pe SmartBill… ${pct}% (câteva secunde per factură).`
          : `Gata. ${progress.ok} emise cu succes${progress.failed ? `, ${progress.failed} eșuate` : ''}.`}
      </div>

      {errors.length > 0 && (
        <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <div className="text-xs font-medium text-destructive">
            {errors.length} {errors.length === 1 ? 'factură eșuată' : 'facturi eșuate'}:
          </div>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-[11px] text-muted-foreground">
            {errors.slice(0, 20).map((e) => (
              <li key={e.paymentId} className="truncate">
                <span className="text-foreground">{emailByPid.get(e.paymentId)}</span> — {e.error}
              </li>
            ))}
            {errors.length > 20 && <li>…și încă {errors.length - 20}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function IssuedRow({
  inv,
  showSite,
  checked,
  onToggle,
  onDeleted,
}: {
  inv: InvoiceDto;
  showSite: boolean;
  checked: boolean;
  onToggle: (shiftKey: boolean) => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      await InvoicesApi.downloadPdf(
        inv.id,
        `Factura-${inv.series ?? ''}-${inv.number ?? inv.id}.pdf`,
      );
    } catch (e) {
      toast({ variant: 'destructive', title: 'PDF indisponibil', description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    const label = inv.series && inv.number ? `${inv.series} ${inv.number}` : 'această factură';
    const ok = await confirmDialog({
      title: 'Ștergi factura?',
      description: `${label} se șterge DOAR din aplicație (rând + PDF), fără storno în SmartBill. Plata redevine facturabilă.`,
      confirmText: 'Șterge definitiv',
      variant: 'destructive',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await InvoicesApi.remove(inv.id);
      toast({ variant: 'success', title: 'Factură ștearsă' });
      onDeleted();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
      setDeleting(false);
    }
  };

  return (
    <TableRow data-state={checked ? 'selected' : undefined}>
      <TableCell>
        <Checkbox checked={checked} onClick={(e) => onToggle(e.shiftKey)} aria-label="Selectează" />
      </TableCell>
      <TableCell className="font-mono text-sm">
        {inv.series && inv.number ? `${inv.series} ${inv.number}` : '—'}
      </TableCell>
      {showSite && (
        <TableCell>
          <SiteBadge siteId={inv.siteId} />
        </TableCell>
      )}
      <TableCell className="text-xs">{inv.clientSnapshot?.name ?? '—'}</TableCell>
      <TableCell className="tabular-nums">{money(inv.amountCents, inv.currency)}</TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {inv.issuedAt ? format(new Date(inv.issuedAt), 'd MMM yyyy', { locale: ro }) : '—'}
      </TableCell>
      <TableCell>
        {inv.status === 'issued' ? (
          <Badge variant="success">emisă</Badge>
        ) : (
          <Badge variant="destructive" title={inv.errorText ?? ''}>
            eșuată
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1.5">
          {inv.status === 'issued' && inv.pdfPath ? (
            <Button variant="outline" size="xs" onClick={download} disabled={busy}>
              <Download />
              {busy ? '…' : 'PDF'}
            </Button>
          ) : inv.status === 'failed' && inv.errorText ? (
            <span
              className="max-w-[200px] truncate text-xs text-destructive"
              title={inv.errorText}
            >
              {inv.errorText.slice(0, 40)}
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={del}
            disabled={deleting}
            aria-label="Șterge factura"
            title="Șterge factura (doar din aplicație, fără storno)"
          >
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function PreviewDialog({
  paymentId,
  onClose,
  onEmitted,
}: {
  paymentId: string;
  onClose: () => void;
  onEmitted: () => void;
}) {
  const { toast } = useToast();
  const { data, loading } = useAsync<InvoicePreview>(() => InvoicesApi.preview(paymentId), [paymentId]);

  const [client, setClient] = useState<InvoiceClientData>({});
  const [productName, setProductName] = useState('');
  const [price, setPrice] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [paymentType, setPaymentType] = useState(DEFAULT_PAYMENT_TYPE);
  const [hydrated, setHydrated] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [saveToClient, setSaveToClient] = useState(true);

  // Hidratează formularul o singură dată după ce vine preview-ul.
  if (data && !hydrated) {
    setClient(data.client ?? {});
    setProductName(data.productName);
    setPrice(String(data.price));
    setIssueDate(data.issueDate);
    setPaymentType(data.paymentType || DEFAULT_PAYMENT_TYPE);
    setHydrated(true);
  }

  const patch = (p: Partial<InvoiceClientData>) => setClient((c) => ({ ...c, ...p }));

  async function emit() {
    if (!client.name?.trim()) {
      toast({ variant: 'destructive', title: 'Numele clientului e obligatoriu' });
      return;
    }
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      toast({ variant: 'destructive', title: 'Preț invalid' });
      return;
    }
    setEmitting(true);
    try {
      await InvoicesApi.emit(paymentId, {
        client,
        productName,
        price: priceNum,
        issueDate,
        paymentType,
      });
      // Persistă datele pe profilul clientului (se aplică la facturile viitoare).
      const email = data?.client?.email || client.email;
      if (saveToClient && email && data?.siteId) {
        try {
          await BillingCustomersApi.upsert(data.siteId, email, {
            name: client.name,
            vatCode: client.vatCode,
            regCom: client.regCom,
            address: client.address,
            city: client.city,
            county: client.county,
            country: client.country,
            isTaxPayer: client.isTaxPayer,
          });
        } catch {
          /* best-effort — nu blocăm emiterea reușită dacă salvarea profilului pică */
        }
      }
      toast({ variant: 'success', title: 'Factură emisă' });
      onEmitted();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Emitere eșuată', description: (e as Error).message });
    } finally {
      setEmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Previzualizare factură</DialogTitle>
          <DialogDescription>
            Modifică datele înainte de emitere. Ex: emite pe persoana ta fizică în loc de cumpărător.
          </DialogDescription>
        </DialogHeader>

        {loading || !hydrated ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              {data?.siteName} · serie <b>{data?.seriesName || '—'}</b> · CIF {data?.companyVatCode || '—'}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Nume / Denumire client *" value={client.name ?? ''} onChange={(v) => patch({ name: v })} />
              <LabeledInput label="Adresă" value={client.address ?? ''} onChange={(v) => patch({ address: v })} />
              <LabeledInput label="Oraș" value={client.city ?? ''} onChange={(v) => patch({ city: v })} />
              <CountySelect value={client.county} onChange={(v) => patch({ county: v })} />
              <LabeledInput label="Țară" value={client.country ?? ''} onChange={(v) => patch({ country: v })} />
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
              <LabeledInput label="Denumire produs" value={productName} onChange={setProductName} />
              <LabeledInput label="Preț (RON, TVA inclus)" type="number" value={price} onChange={setPrice} />
              <LabeledInput label="Data emiterii" type="date" value={issueDate} onChange={setIssueDate} />
              <div className="space-y-1">
                <Label className="text-xs">Metoda de plată</Label>
                <Select value={paymentType} onValueChange={setPaymentType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {hydrated && (
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={saveToClient} onCheckedChange={(v) => setSaveToClient(!!v)} />
            Salvează aceste date pe client (se aplică la facturile lui viitoare)
          </label>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={emitting}>
            Renunță
          </Button>
          <Button onClick={emit} disabled={emitting || loading || !hydrated}>
            {emitting ? 'Se emite…' : 'Emite factura'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
