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
