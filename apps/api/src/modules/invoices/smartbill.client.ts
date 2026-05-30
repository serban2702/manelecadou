import { Injectable, Logger } from '@nestjs/common';

const SMARTBILL_BASE = 'https://ws.smartbill.ro/SBORO/api';

export interface SmartbillCredentials {
  email: string;
  token: string;
}

export interface SmartbillClientData {
  name: string;
  vatCode?: string;
  regCom?: string;
  address?: string;
  city?: string;
  county?: string;
  country?: string;
  email?: string;
  isTaxPayer?: boolean;
}

export interface SmartbillProduct {
  name: string;
  measuringUnitName: string;
  currency: string;
  quantity: number;
  price: number;
  isTaxIncluded: boolean;
  taxName: string;
  taxPercentage: number;
  isService: boolean;
  saveToDb: boolean;
}

export interface SmartbillInvoiceInput {
  companyVatCode: string;
  seriesName: string;
  issueDate: string; // YYYY-MM-DD
  dueDate?: string;
  currency: string;
  language?: string;
  precision?: number;
  isDraft?: boolean;
  useStock?: boolean;
  client: SmartbillClientData;
  products: SmartbillProduct[];
  /** Încasare embedded → factura iese încasată. */
  payment?: {
    value: number;
    type: string; // "Card", "Chitanta", "Ordin de plata"...
    isCash: boolean;
    /** Seria încasării/chitanței (opțional). */
    paymentSeries?: string;
  };
  observations?: string;
  mentions?: string;
}

export interface SmartbillInvoiceResult {
  series?: string;
  number?: string;
  url?: string;
  message?: string;
  raw: unknown;
}

/**
 * Wrapper minimal peste SmartBill Cloud API (REST). Auth = HTTP Basic cu
 * `base64(email:token)`. Atenție: API-ul răspunde adesea cu HTTP 200 chiar și
 * la erori logice — în acel caz câmpul `errorText` din body e ne-gol.
 *
 * Rate limit SmartBill: 3 req/sec. Apelantul (InvoicesService) throttle-uiește
 * emiterea în masă.
 */
@Injectable()
export class SmartbillClient {
  private readonly logger = new Logger(SmartbillClient.name);

  private authHeader(creds: SmartbillCredentials): string {
    const basic = Buffer.from(`${creds.email}:${creds.token}`).toString('base64');
    return `Basic ${basic}`;
  }

  /** Emite o factură. Aruncă Error cu mesaj prietenos dacă SmartBill respinge. */
  async createInvoice(
    creds: SmartbillCredentials,
    input: SmartbillInvoiceInput,
  ): Promise<SmartbillInvoiceResult> {
    let res: Response;
    try {
      res = await fetch(`${SMARTBILL_BASE}/invoice`, {
        method: 'POST',
        headers: {
          Authorization: this.authHeader(creds),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(input),
      });
    } catch (err) {
      throw new Error(`SmartBill network error: ${(err as Error).message}`);
    }

    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      // răspuns non-JSON
    }

    if (!res.ok) {
      const msg =
        (json.errorText as string) ||
        (json.message as string) ||
        text.slice(0, 500) ||
        `HTTP ${res.status}`;
      throw new Error(`SmartBill ${res.status}: ${msg}`);
    }

    // HTTP 200 dar errorText ne-gol → eroare logică (serie inexistentă, CIF greșit etc.)
    const errorText = (json.errorText as string) || '';
    if (errorText.trim()) {
      throw new Error(`SmartBill: ${errorText}`);
    }

    return {
      series: json.series as string | undefined,
      number: json.number as string | undefined,
      url: json.url as string | undefined,
      message: json.message as string | undefined,
      raw: json,
    };
  }

  /** Descarcă PDF-ul facturii ca Buffer. */
  async getInvoicePdf(
    creds: SmartbillCredentials,
    companyVatCode: string,
    seriesName: string,
    number: string,
  ): Promise<Buffer> {
    const qs = new URLSearchParams({
      cif: companyVatCode,
      seriesname: seriesName,
      number,
    });
    const res = await fetch(`${SMARTBILL_BASE}/invoice/pdf?${qs.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: this.authHeader(creds),
        Accept: 'application/octet-stream',
      },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`SmartBill PDF ${res.status}: ${txt.slice(0, 300)}`);
    }
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  /**
   * Listează seriile de facturi (type='f') — folosit de butonul „Testează
   * conexiunea" din admin pentru a valida credențialele + CIF-ul.
   */
  async listSeries(
    creds: SmartbillCredentials,
    companyVatCode: string,
  ): Promise<{ ok: boolean; series: string[]; message?: string }> {
    const qs = new URLSearchParams({ cif: companyVatCode, type: 'f' });
    let res: Response;
    try {
      res = await fetch(`${SMARTBILL_BASE}/series?${qs.toString()}`, {
        method: 'GET',
        headers: {
          Authorization: this.authHeader(creds),
          Accept: 'application/json',
        },
      });
    } catch (err) {
      return { ok: false, series: [], message: `network: ${(err as Error).message}` };
    }
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      // ignore
    }
    if (!res.ok) {
      return {
        ok: false,
        series: [],
        message: (json.errorText as string) || `HTTP ${res.status}`,
      };
    }
    const errorText = (json.errorText as string) || '';
    if (errorText.trim()) {
      return { ok: false, series: [], message: errorText };
    }
    const list = Array.isArray(json.list) ? (json.list as Array<Record<string, unknown>>) : [];
    return {
      ok: true,
      series: list.map((s) => String(s.name ?? '')).filter(Boolean),
    };
  }
}
