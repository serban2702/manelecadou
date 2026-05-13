import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { SettingsService } from '../settings/settings.service';

/**
 * Trimite evenimente către TikTok Events API (server-side) pentru dedup cu pixelul
 * browser și pentru a ocoli ad blockers / iOS / cookie restrictions.
 *
 * Docs: https://business-api.tiktok.com/portal/docs?id=1771101303285761
 *
 * Foloseste `TIKTOK_PIXEL_ID` (același ca pe browser) și `TIKTOK_ACCESS_TOKEN`
 * (din Events Manager → Settings → Generate Access Token). Setări citite din
 * SettingsService (admin /settings) sau din env ca fallback.
 */
@Injectable()
export class TiktokEventsService {
  private readonly logger = new Logger('TiktokEvents');
  private readonly endpoint = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

  constructor(private readonly settings: SettingsService) {}

  async isEnabled(): Promise<boolean> {
    const pixelId = await this.settings.get('TIKTOK_PIXEL_ID');
    const token = await this.settings.get('TIKTOK_ACCESS_TOKEN');
    return !!(pixelId && token);
  }

  /**
   * Trimite un eveniment. `eventId` trebuie să fie identic cu cel trimis de
   * pixelul browser ca să se facă dedup automat.
   */
  async trackEvent(input: {
    eventName: 'PageView' | 'ViewContent' | 'InitiateCheckout' | 'CompletePayment';
    eventId: string;
    eventTimeUnix?: number;
    url?: string;
    referrer?: string;
    userAgent?: string | null;
    ip?: string | null;
    email?: string | null;
    value?: number;
    currency?: string;
    contentId?: string;
    contentName?: string;
  }): Promise<void> {
    const pixelId = await this.settings.get('TIKTOK_PIXEL_ID');
    const token = await this.settings.get('TIKTOK_ACCESS_TOKEN');
    if (!pixelId || !token) {
      this.logger.debug('TIKTOK_PIXEL_ID / TIKTOK_ACCESS_TOKEN missing — skip');
      return;
    }

    const user: Record<string, unknown> = {};
    if (input.email) user.email = sha256Hex(input.email.trim().toLowerCase());
    if (input.userAgent) user.user_agent = input.userAgent;
    if (input.ip) user.ip = input.ip;

    const properties: Record<string, unknown> = {};
    if (input.value != null) properties.value = input.value;
    if (input.currency) properties.currency = input.currency;
    if (input.contentId) {
      properties.contents = [
        {
          content_id: input.contentId,
          content_name: input.contentName,
          content_type: 'product',
          quantity: 1,
          price: input.value,
        },
      ];
    }

    const body = {
      event_source: 'web',
      event_source_id: pixelId,
      data: [
        {
          event: input.eventName,
          event_time: input.eventTimeUnix ?? Math.floor(Date.now() / 1000),
          event_id: input.eventId,
          user,
          properties,
          page: {
            url: input.url,
            referrer: input.referrer,
          },
        },
      ],
    };

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Token': token,
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
      if (!res.ok || (json.code != null && json.code !== 0)) {
        this.logger.warn(
          `TikTok Events API error (${input.eventName}, id=${input.eventId}): ${res.status} ${json.message ?? ''}`,
        );
      } else {
        this.logger.log(`TikTok ${input.eventName} sent (event_id=${input.eventId})`);
      }
    } catch (err) {
      this.logger.warn(`TikTok Events API request failed: ${(err as Error).message}`);
    }
  }
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
