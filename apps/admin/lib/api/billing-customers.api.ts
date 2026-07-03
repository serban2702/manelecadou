import { http } from '../http/client';

/** Un rând din lista de clienți (datele efective + statistici). */
export interface BillingCustomerRow {
  siteId: string | null;
  email: string;
  name: string | null;
  vatCode: string | null;
  regCom: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  country: string | null;
  phone: string | null;
  isTaxPayer: boolean;
  notes: string | null;
  /** id-ul override-ului salvat (null = doar derivat din plăți). */
  savedId: string | null;
  /** true dacă există un profil salvat manual. */
  saved: boolean;
  ordersPaid: number;
  ordersTotal: number;
  paidTotalRonCents: number;
  invoicesCount: number;
  lastOrderAt: string | null;
}

/** Câmpurile editabile trimise la upsert (autosave inline). */
export interface BillingCustomerPatch {
  name?: string | null;
  vatCode?: string | null;
  regCom?: string | null;
  address?: string | null;
  city?: string | null;
  county?: string | null;
  country?: string | null;
  phone?: string | null;
  isTaxPayer?: boolean;
  notes?: string | null;
}

export interface SavedBillingCustomer extends BillingCustomerPatch {
  id: string;
  siteId: string | null;
  email: string;
}

export class BillingCustomersApi {
  static list(params?: {
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<{ items: BillingCustomerRow[]; total: number }> {
    return http.get('/admin/billing-customers', { params });
  }

  /** Upsert profil client (autosave). siteId + email identifică rândul. */
  static upsert(
    siteId: string | null,
    email: string,
    patch: BillingCustomerPatch,
  ): Promise<SavedBillingCustomer> {
    return http.put('/admin/billing-customers', { siteId, email, ...patch });
  }

  /** Șterge override-ul (revine la datele derivate din plăți). */
  static reset(id: string): Promise<{ ok: true; id: string }> {
    return http.delete(`/admin/billing-customers/${id}`);
  }
}
