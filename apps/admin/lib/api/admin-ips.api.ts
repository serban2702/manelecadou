import { http } from '../http/client';

export interface AdminIpRow {
  id: string;
  ip: string;
  label: string | null;
  /** False = păstrat în listă, dar ignorat la excluderea din rapoarte. */
  enabled: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export class AdminIpsApi {
  static list(): Promise<AdminIpRow[]> {
    return http.get('/admin/admin-ips');
  }
  static patch(id: string, patch: { enabled?: boolean; label?: string }): Promise<{ ok: boolean }> {
    return http.patch(`/admin/admin-ips/${id}`, patch);
  }
  static remove(id: string): Promise<{ ok: boolean }> {
    return http.delete(`/admin/admin-ips/${id}`);
  }
  /** Câte sesiuni ar fi marcate retroactiv, fără să schimbe nimic. */
  static previewBackfill(): Promise<{ ips: number; sessions: number }> {
    return http.get('/admin/admin-ips/backfill/preview');
  }
  static backfill(): Promise<{ ips: number; updated: number }> {
    return http.post('/admin/admin-ips/backfill', {});
  }
}
