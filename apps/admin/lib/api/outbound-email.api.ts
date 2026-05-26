import { http } from '../http/client';
import type { AdminOutboundEmail } from '../types';

export interface OutboundEmailListResponse {
  items: AdminOutboundEmail[];
  total: number;
}

export interface OutboundEmailStats {
  last24h: { queued?: number; sent?: number; failed?: number } & Record<string, number>;
  queued: number;
  failed: number;
}

export class OutboundEmailApi {
  static list(params: {
    status?: 'queued' | 'sent' | 'failed';
    kind?: string;
    q?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<OutboundEmailListResponse> {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    return http.get(`/admin/outbound-emails${qs.toString() ? '?' + qs.toString() : ''}`);
  }

  static get(id: string): Promise<AdminOutboundEmail> {
    return http.get(`/admin/outbound-emails/${id}`);
  }

  static stats(): Promise<OutboundEmailStats> {
    return http.get('/admin/outbound-emails/stats');
  }
}
