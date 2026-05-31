'use client';

import { useMemo, useState } from 'react';
import { useAsync } from '@/lib/hooks/use-async';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { Download, FileText, Receipt } from 'lucide-react';
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

export default function FacturarePage() {
  const { toast } = useToast();
  const { isAllSelected } = useSitesMap();

  const billable = useAsync(() => InvoicesApi.billable(), [], { refetchInterval: 20_000 });
  const issued = useAsync(() => InvoicesApi.issued(), [], { refetchInterval: 20_000 });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const rows = billable.data ?? [];
  const selectableIds = useMemo(
    () => rows.filter((r) => r.smartbillReady).map((r) => r.paymentId),
    [rows],
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(selectableIds));

  const refetchAll = () => {
    billable.refetch();
    issued.refetch();
  };

  async function emitBulk() {
    const ids = [...selected];
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
      setSelected(new Set());
      refetchAll();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    } finally {
      setBulkBusy(false);
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
          <TabsTrigger value="issued">Emise ({(issued.data ?? []).length})</TabsTrigger>
        </TabsList>

        {/* ───────── De facturat ───────── */}
        <TabsContent value="billable">
          {selected.size > 0 && (
            <div className="flex items-center gap-3 mb-3 p-3 rounded-md border border-border bg-secondary/20">
              <span className="text-sm">{selected.size} selectate</span>
              <Button size="sm" onClick={emitBulk} disabled={bulkBusy}>
                {bulkBusy ? 'Se emit…' : 'Emite selectate'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={bulkBusy}>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Selectează tot" />
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
                {rows.map((r) => (
                  <TableRow key={r.paymentId}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(r.paymentId)}
                        disabled={!r.smartbillReady}
                        onCheckedChange={() => toggleOne(r.paymentId)}
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
          )}
        </TabsContent>

        {/* ───────── Emise ───────── */}
        <TabsContent value="issued">
          {issued.loading ? (
            <Skeleton className="h-72 w-full" />
          ) : (issued.data ?? []).length === 0 ? (
            <Empty
              icon={<FileText className="h-5 w-5" />}
              title="Nicio factură emisă"
              description="Facturile emise apar aici cu serie, număr și PDF."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serie / Număr</TableHead>
                  {isAllSelected && <TableHead>Site</TableHead>}
                  <TableHead>Client</TableHead>
                  <TableHead>Sumă</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(issued.data ?? []).map((inv) => (
                  <IssuedRow key={inv.id} inv={inv} showSite={isAllSelected} />
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      {previewFor && (
        <PreviewDialog
          paymentId={previewFor}
          onClose={() => setPreviewFor(null)}
          onEmitted={() => {
            setPreviewFor(null);
            setSelected((prev) => {
              const next = new Set(prev);
              next.delete(previewFor);
              return next;
            });
            refetchAll();
          }}
        />
      )}
    </div>
  );
}

function IssuedRow({ inv, showSite }: { inv: InvoiceDto; showSite: boolean }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
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
  return (
    <TableRow>
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
        {inv.status === 'issued' && inv.pdfPath ? (
          <Button variant="outline" size="xs" onClick={download} disabled={busy}>
            <Download />
            {busy ? '…' : 'PDF'}
          </Button>
        ) : inv.status === 'failed' ? (
          <span className="text-xs text-destructive">{inv.errorText?.slice(0, 60)}</span>
        ) : (
          '—'
        )}
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
              <LabeledInput label="CUI (opțional, doar firme)" value={client.vatCode ?? ''} onChange={(v) => patch({ vatCode: v })} />
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
