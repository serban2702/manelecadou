import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

export interface WingoSendInput {
  /** Titlul notificării (max 500; trunchiat la ~65 pe dispozitiv). */
  title: string;
  /** Corpul notificării (1+ caractere; trunchiat la ~240 pe dispozitiv). */
  body: string;
  /** Prioritate — 'high' pentru alerte urgente. Default 'normal'. */
  priority?: 'normal' | 'high';
  /** Payload JSON opțional atașat notificării. */
  data?: Record<string, unknown>;
}

export interface WingoSendResult {
  ok: boolean;
  deviceCount?: number;
  notificationId?: string;
  error?: string;
}

const DEFAULT_URL = 'https://notifications.wingo.ro/api/v1/notify/send';

/**
 * Client pentru Wingo Notifications (https://notifications.wingo.ro/integration.md).
 *
 * `POST /api/v1/notify/send` cu header `X-API-Key`. Trimite notificări push către
 * dispozitivele owner-ului. Cheia + URL-ul vin din settings (cu fallback pe env):
 *   - WINGO_API_KEY   (secret, 64 hex)
 *   - WINGO_NOTIFY_URL (default endpoint-ul de mai sus)
 *
 * Graceful by design: NU aruncă niciodată — loghează și întoarce `{ ok:false }`.
 * O alertă pierdută nu trebuie să rupă monitorul.
 */
@Injectable()
export class WingoNotifyService {
  private readonly logger = new Logger('WingoNotify');

  constructor(private readonly settings: SettingsService) {}

  async isConfigured(): Promise<boolean> {
    return !!(await this.settings.get('WINGO_API_KEY')).trim();
  }

  async send(input: WingoSendInput): Promise<WingoSendResult> {
    const apiKey = (await this.settings.get('WINGO_API_KEY')).trim();
    if (!apiKey) {
      this.logger.warn('WINGO_API_KEY nesetat — sar peste trimitere');
      return { ok: false, error: 'WINGO_API_KEY missing' };
    }
    const url = (await this.settings.get('WINGO_NOTIFY_URL')).trim() || DEFAULT_URL;
    const payload = {
      title: input.title.slice(0, 500),
      body: input.body.slice(0, 2000),
      priority: input.priority ?? 'normal',
      ...(input.data ? { data: input.data } : {}),
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify(payload),
      });
      const txt = await res.text();
      if (!res.ok) {
        this.logger.warn(`Wingo HTTP ${res.status}: ${txt.slice(0, 300)}`);
        return { ok: false, error: `HTTP ${res.status}` };
      }
      let json: { data?: { device_count?: number; notification_id?: string } } | null = null;
      try {
        json = JSON.parse(txt);
      } catch {
        /* răspuns non-JSON — îl tratăm ca succes dacă HTTP a fost 2xx */
      }
      const deviceCount = json?.data?.device_count;
      const notificationId = json?.data?.notification_id;
      this.logger.log(`trimis „${payload.title}" → devices=${deviceCount ?? '?'}`);
      return { ok: true, deviceCount, notificationId };
    } catch (err) {
      this.logger.warn(`Wingo send error: ${(err as Error).message}`);
      return { ok: false, error: (err as Error).message };
    }
  }
}
