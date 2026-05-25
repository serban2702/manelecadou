import { http } from '../http/client';

export interface PushSubscriptionInfo {
  id: string;
  endpoint: string;
  userAgent: string | null;
  label: string | null;
  createdAt: string;
  lastSuccessAt: string | null;
  failureCount: number;
}

export class WebPushApi {
  static publicKey(): Promise<{ publicKey: string | null; configured: boolean }> {
    return http.get('/admin/web-push/public-key');
  }
  static subscriptions(): Promise<PushSubscriptionInfo[]> {
    return http.get('/admin/web-push/subscriptions');
  }
  static subscribe(args: {
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string;
    label?: string;
  }): Promise<{ ok: boolean; id?: string; reason?: string }> {
    return http.post('/admin/web-push/subscribe', args);
  }
  static unsubscribe(endpoint: string): Promise<{ ok: boolean }> {
    return http.delete('/admin/web-push/subscribe', { data: { endpoint } });
  }
  static test(): Promise<{ ok: boolean; sent: number; pruned: number }> {
    return http.post('/admin/web-push/test', {});
  }
  static reload(): Promise<{ ok: boolean; configured: boolean }> {
    return http.post('/admin/web-push/reload', {});
  }
}
