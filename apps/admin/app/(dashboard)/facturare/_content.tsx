'use client';

import { useRef, useState } from 'react';
import { useAsync } from '@/lib/hooks/use-async';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { Download, FileText, Receipt, Trash2 } from 'lucide-react';
import {
  InvoicesApi,
  type BillablePayment,
  type InvoiceClientData,
  type InvoiceDto,
  type InvoicePreview,
} from '@/lib/api/invoices.api';
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

  // Fără auto-refetch pe billable: fiecare încărcare interoghează Stripe per plată
  // pentru numele real al plătitorului. E un flux manual (o dată/zi), refresh la nevoie.
  const billable = useAsync(() => InvoicesApi.billable(), []);
  const issued = useAsync(() => InvoicesApi.issued(), [], { refetchInterval: 30_000 });

  const rows = billable.data ?? [];
  const issuedRows = issued.data ?? [];

  const billSel = useRangeSelect<BillablePayment>(
    rows,
    (r) => r.paymentId,
    (r) => r.smartbillReady,
  );
  const invSel = useRangeSelect<InvoiceDto>(issuedRows, (inv) => inv.id);

  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [delBusy, setDelBusy] = useState(false);

  const refetchAll = () => {
    billable.refetch();
    issued.refetch();
  };

  async function emitBulk() {
    const ids = [...billSel.selected];
    if (ids.length === 0) return;
    const ok = await confirmDialog({
      title: `Emite ${ids.length} ${ids.length === 1 ? 'factură' : 'facturi'}?`,
      description:
        'Se vor emite în SmartBill cu datele implicite ale fiecărui site (clientul implicit dacă e activat). Pentru date custom, folosește „Previzualizează" per factură.',
      confirmText: 'Emite toate',
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      const res = await InvoicesApi.emitBulk(ids);
      const okN = res.filter((r) => r.ok).length;
      const failN = res.length - okN;
      toast({
        variant: failN ? 'destructive' : 'success',
        title: `${okN} emise${failN ? `, ${failN} eșuate` : ''}`,
        description: failN
          ? res.filter((r) => !r.ok).map((r) => r.error).slice(0, 3).join(' | ')
          : undefined,
      });
      billSel.clear();
      refetchAll();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    } finally {
      setBulkBusy(false);
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
              <Button size="sm" onClick={emitBulk} disabled={bulkBusy}>
                {bulkBusy ? 'Se emit…' : 'Emite selectate'}
              </Button>
              <Button size="sm" variant="ghost" onClick={billSel.clear} disabled={bulkBusy}>
                Anulează
              </Button>
            </div>
          )}

          {billable.loading ? (
            <Skeleton className="h-72 w-full" />
          ) : rows.length === 0 ? (
            <Empty
              icon={<Receipt className="h-5 w-5" />}
              title="Nimic de facturat"
              description="Toate plățile finalizate au fost facturate (sau nu există plăți > 0)."
            />
          ) : (
            <>
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
                    <TableHead>Data plății</TableHead>
                    {isAllSelected && <TableHead>Site</TableHead>}
                    <TableHead>Cumpărător</TableHead>
                    <TableHead>Sumă</TableHead>
                    <TableHead>SmartBill</TableHead>
                    <TableHead className="text-right">Acțiuni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, idx) => (
                    <TableRow
                      key={r.paymentId}
                      data-state={billSel.selected.has(r.paymentId) ? 'selected' : undefined}
                    >
                      <TableCell>
                        <Checkbox
                          checked={billSel.selected.has(r.paymentId)}
                          disabled={!r.smartbillReady}
                          onClick={(e) => billSel.toggle(idx, e.shiftKey)}
                          aria-label="Selectează"
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(r.createdAt), "d MMM yyyy 'la' HH:mm", { locale: ro })}
                      </TableCell>
                      {isAllSelected && (
                        <TableCell>
                          <SiteBadge siteId={r.siteId} />
                        </TableCell>
                      )}
                      <TableCell className="text-xs">
                        <div>{r.buyerName ?? '—'}</div>
                        <div className="text-muted-foreground">{r.buyerEmail ?? ''}</div>
                      </TableCell>
                      <TableCell className="tabular-nums font-medium">
                        {money(r.amountCents, r.currency)}
                      </TableCell>
                      <TableCell>
                        {r.smartbillReady ? (
                          <Badge variant="success">configurat</Badge>
                        ) : (
                          <Badge variant="outline">neconfigurat</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={!r.smartbillReady}
                          onClick={() => setPreviewFor(r.paymentId)}
                        >
                          Previzualizează
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Tip: ține <kbd className="rounded border border-border px-1 py-0.5">Shift</kbd> apăsat
                la click pe o bifă ca să selectezi un interval întreg.
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
  const [hydrated, setHydrated] = useState(false);
  const [emitting, setEmitting] = useState(false);

  // Hidratează formularul o singură dată după ce vine preview-ul.
  if (data && !hydrated) {
    setClient(data.client ?? {});
    setProductName(data.productName);
    setPrice(String(data.price));
    setIssueDate(data.issueDate);
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
      });
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
              {data?.siteName} · serie <b>{data?.seriesName || '—'}</b> · CIF {data?.companyVatCode || '—'} ·
              încasare {data?.paymentType}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Nume / Denumire client *" value={client.name ?? ''} onChange={(v) => patch({ name: v })} />
              <LabeledInput label="Adresă" value={client.address ?? ''} onChange={(v) => patch({ address: v })} />
              <LabeledInput label="Oraș" value={client.city ?? ''} onChange={(v) => patch({ city: v })} />
              <LabeledInput label="Județ" value={client.county ?? ''} onChange={(v) => patch({ county: v })} />
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
              <LabeledInput label="Denumire produs" value={productName} onChange={setProductName} />
              <LabeledInput label="Preț (RON, TVA inclus)" type="number" value={price} onChange={setPrice} />
              <LabeledInput label="Data emiterii" type="date" value={issueDate} onChange={setIssueDate} />
            </div>
          </div>
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
