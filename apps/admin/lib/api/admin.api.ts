import { http } from '../http/client';
import type {
  AdminError,
  AdminGeneration,
  AdminGiftCode,
  AdminGuest,
  AdminPayment,
  AdminPromoCode,
  AdminStats,
  AdminUser,
} from '../types';

export class AdminApi {
  static stats(): Promise<AdminStats> { return http.get('/admin/stats'); }
  static users(): Promise<AdminUser[]> { return http.get('/admin/users'); }
  static guests(): Promise<AdminGuest[]> { return http.get('/admin/guests'); }
  static generations(): Promise<AdminGeneration[]> { return http.get('/admin/generations'); }
  static payments(): Promise<AdminPayment[]> { return http.get('/admin/payments'); }
  static runSeeder(): Promise<{ users: number; generations: number; conversations: number }> {
    return http.post('/admin/seeder/run');
  }
  static userSetRole(id: string, role: 'user' | 'admin'): Promise<unknown> {
    return http.patch(`/admin/users/${id}/role`, { role });
  }
  static userResetDemo(id: string): Promise<unknown> {
    return http.post(`/admin/users/${id}/reset-demo`);
  }
  static generationForceUnlock(id: string): Promise<unknown> {
    return http.post(`/admin/generations/${id}/force-unlock`);
  }
  static generationDelete(id: string): Promise<unknown> {
    return http.delete(`/admin/generations/${id}`);
  }
  static generationRetry(id: string): Promise<{ ok: boolean; status: string; retryCount: number }> {
    return http.post(`/admin/generations/${id}/retry`);
  }
  static generationManualUpload(
    id: string,
    main: File,
    bonus: File | null,
  ): Promise<{ ok: boolean; status: string; audioUrl: string; bonusAudioUrl: string | null }> {
    const fd = new FormData();
    fd.append('main', main);
    if (bonus) fd.append('bonus', bonus);
    return http.post(`/admin/generations/${id}/manual-upload`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
    });
  }
  static paymentStripeDetails(id: string): Promise<{
    name: string | null;
    email: string | null;
    phone: string | null;
    address: {
      line1: string | null;
      line2: string | null;
      city: string | null;
      state: string | null;
      postalCode: string | null;
      country: string | null;
    } | null;
    paymentMethod: {
      brand: string | null;
      last4: string | null;
      expMonth: number | null;
      expYear: number | null;
      country: string | null;
    } | null;
  } | null> {
    return http.get(`/admin/payments/${id}/stripe-details`);
  }
  static paymentRefund(
    id: string,
    body: { amountCents?: number; reason?: string } = {},
  ): Promise<
    | { ok: true; refundId: string; amountCents: number }
    | { ok: false; error: string }
  > {
    return http.post(`/admin/payments/${id}/refund`, body);
  }
}

// ============== SEO Pages ==============

export interface AdminSeoPage {
  id: string;
  siteId: string;
  slug: string;
  /** Slug în limba site-ului. Pentru RO sau pagini ne-regenerate poate fi null/egal cu slug. */
  localizedSlug?: string | null;
  category: string;
  locale: string;
  title: string;
  metaDescription: string;
  h1: string;
  excerpt: string | null;
  contentMd: string;
  source: 'ai' | 'manual';
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SeoBulkJob {
  status: 'running' | 'done' | 'error';
  total: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: string[];
  startedAt: number;
  endedAt?: number;
  errorMessage?: string;
}

export interface SeoSlugTemplate {
  slug: string;
  category: string;
  primaryKeyword: string;
  intent: string;
}

export class SeoPagesApi {
  static list(): Promise<AdminSeoPage[]> {
    return http.get('/admin/seo-pages');
  }
  static templates(): Promise<SeoSlugTemplate[]> {
    return http.get('/admin/seo-pages/templates');
  }
  static regenerateAll(opts: { regenerate?: boolean } = {}): Promise<SeoBulkJob> {
    // Endpoint-ul răspunde 202 imediat — job-ul rulează în background pe API.
    return http.post('/admin/seo-pages/regenerate-all', opts);
  }
  static regenerateStatus(): Promise<SeoBulkJob | { status: 'idle' }> {
    return http.get('/admin/seo-pages/regenerate-status');
  }
  static regenerateOne(slug: string): Promise<AdminSeoPage> {
    return http.post(`/admin/seo-pages/${slug}/regenerate`);
  }
  static update(
    id: string,
    patch: Partial<Pick<AdminSeoPage, 'title' | 'metaDescription' | 'h1' | 'excerpt' | 'contentMd' | 'published'>>,
  ): Promise<AdminSeoPage> {
    return http.patch(`/admin/seo-pages/${id}`, patch);
  }
  static delete(id: string): Promise<{ ok: boolean }> {
    return http.delete(`/admin/seo-pages/${id}`);
  }
}

export class PromoApi {
  static list(): Promise<AdminPromoCode[]> { return http.get('/admin/promo'); }
  static create(input: {
    code?: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
    validUntil?: string;
    maxUses?: number;
    restrictedToEmail?: string;
    note?: string;
  }): Promise<AdminPromoCode> {
    return http.post('/admin/promo', input);
  }
  static setActive(id: string, active: boolean): Promise<AdminPromoCode> {
    return http.patch(`/admin/promo/${id}/active`, { active });
  }
  static update(
    id: string,
    patch: {
      code?: string;
      discountType?: 'percent' | 'fixed';
      discountValue?: number;
      validFrom?: string | null;
      validUntil?: string | null;
      maxUses?: number;
      restrictedToEmail?: string | null;
      note?: string | null;
      active?: boolean;
    },
  ): Promise<AdminPromoCode> {
    return http.patch(`/admin/promo/${id}`, patch);
  }
  static delete(id: string): Promise<{ ok: true }> {
    return http.delete(`/admin/promo/${id}`);
  }
}

export class ErrorsApi {
  static list(params: { level?: string; source?: string; resolved?: 'true' | 'false'; limit?: number } = {}): Promise<AdminError[]> {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    return http.get(`/admin/errors${qs.toString() ? '?' + qs.toString() : ''}`);
  }
  static stats(): Promise<{ last24h: Record<string, number>; unresolved: number }> {
    return http.get('/admin/errors/stats');
  }
  static resolve(id: string): Promise<unknown> {
    return http.patch(`/admin/errors/${id}/resolve`);
  }
  static resolveAll(): Promise<{ ok: boolean; affected: number }> {
    return http.patch('/admin/errors/resolve-all');
  }
  static clear(onlyResolved = false): Promise<{ ok: boolean; affected: number }> {
    return http.delete(`/admin/errors${onlyResolved ? '?onlyResolved=true' : ''}`);
  }
}

export class GiftCodesApi {
  static list(): Promise<AdminGiftCode[]> { return http.get('/admin/gift-codes'); }
  static setActive(id: string, active: boolean): Promise<unknown> {
    return http.patch(`/admin/gift-codes/${id}/active`, { active });
  }
  static extend(id: string, days: number): Promise<unknown> {
    return http.patch(`/admin/gift-codes/${id}/extend`, { days });
  }
}
