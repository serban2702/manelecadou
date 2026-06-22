import { http } from '../http/client';

export interface InvoiceClientData {
  name?: string;
  vatCode?: string;
  regCom?: string;
  address?: string;
  city?: string;
  county?: string;
  country?: string;
  email?: string;
  isTaxPayer?: boolean;
}

export interface BillablePayment {
  paymentId: string;
  siteId: string | null;
  amountCents: number;
  currency: string;
  createdAt: string;
  buyerName: string | null;
  buyerEmail: string | null;
  /** Clientul cu care s-ar emite factura (editabil în modalul de emitere). */
  client?: InvoiceClientData;
  /** 'failed' dacă o emitere anterioară a eșuat; 'none' altfel. */
  invoiceStatus?: 'none' | 'failed';
  smartbillReady: boolean;
}

export interface InvoicePreview {
  paymentId: string;
  siteId: string | null;
  siteName: string;
  amountCents: number;
  price: number;
  currency: string;
  paymentType: string;
  productName: string;
  measuringUnit: string;
  seriesName: string;
  companyVatCode: string;
  issueDate: string;
  client: InvoiceClientData;
  smartbillReady: boolean;
}

export interface InvoiceDto {
  id: string;
  siteId: string | null;
  paymentId: string;
  status: 'issued' | 'failed';
  series: string | null;
  number: string | null;
  companyVatCode: string | null;
  clientSnapshot: InvoiceClientData;
  productSnapshot: { name: string; measuringUnit: string; quantity: number; price: number };
  amountCents: number;
  currency: string;
  paymentType: string | null;
  pdfPath: string | null;
  errorText: string | null;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmitOverrides {
  client?: InvoiceClientData;
  productName?: string;
  price?: number;
  paymentType?: string;
  issueDate?: string;
  observations?: string;
}

export interface BulkEmitResult {
  paymentId: string;
  ok: boolean;
  error?: string;
  invoiceId?: string;
}

export class InvoicesApi {
  static billable(): Promise<BillablePayment[]> {
    return http.get('/admin/invoices/billable');
  }
  static issued(): Promise<InvoiceDto[]> {
    return http.get('/admin/invoices');
  }
  static preview(paymentId: string): Promise<InvoicePreview> {
    return http.get(`/admin/invoices/preview/${paymentId}`);
  }
  static testConnection(siteId: string): Promise<{ ok: boolean; series: string[]; message?: string }> {
    return http.get(`/admin/invoices/test-connection/${siteId}`);
  }
  static emit(paymentId: string, overrides?: EmitOverrides): Promise<InvoiceDto> {
    return http.post('/admin/invoices/emit', { paymentId, overrides });
  }
  static emitBulk(
    paymentIds: string[],
    overridesByPayment?: Record<string, EmitOverrides>,
  ): Promise<BulkEmitResult[]> {
    return http.post('/admin/invoices/emit-bulk', { paymentIds, overridesByPayment });
  }
  static async downloadPdf(invoiceId: string, filename: string): Promise<void> {
    const blob = await http.get<Blob>(`/admin/invoices/${invoiceId}/pdf`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }
  /** Șterge o factură doar din aplicație (DB + PDF). Fără storno SmartBill. */
  static remove(invoiceId: string): Promise<{ ok: true; id: string; paymentId: string }> {
    return http.delete(`/admin/invoices/${invoiceId}`);
  }
  /** Șterge mai multe facturi deodată (doar din aplicație). */
  static removeBulk(
    ids: string[],
  ): Promise<{ deleted: number; errors: { id: string; error: string }[] }> {
    return http.post('/admin/invoices/delete-bulk', { ids });
  }
}
