import { http } from '../http/client';
import type { SunoLog, SunoLogDetail, SunoPurchase, SunoSummary } from '../types';

export class SunoApi {
  static summary(): Promise<SunoSummary> {
    return http.get('/admin/suno/summary');
  }
  static logs(params: { limit?: number; outcome?: string; generationId?: string } = {}): Promise<SunoLog[]> {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, String(v)); });
    return http.get(`/admin/suno/logs${qs.toString() ? '?' + qs.toString() : ''}`);
  }
  static logDetail(id: string): Promise<SunoLogDetail> {
    return http.get(`/admin/suno/logs/${id}`);
  }
  static purchases(): Promise<SunoPurchase[]> {
    return http.get('/admin/suno/credit-purchases');
  }
  static purchaseCreate(input: { credits: number; amountRon: number; amountUsd?: number; purchasedAt?: string; notes?: string }): Promise<unknown> {
    return http.post('/admin/suno/credit-purchases', input);
  }
  static purchaseDelete(id: string): Promise<unknown> {
    return http.delete(`/admin/suno/credit-purchases/${id}`);
  }
}
