import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Site } from '../sites/site.entity';

/**
 * Trimite evenimente către TikTok Events API (server-side) pentru dedup cu pixelul
 * browser și pentru a ocoli ad blockers / iOS / cookie restrictions.
 *
 * Docs: https://business-api.tiktok.com/portal/docs?id=1771101303285761
 *
 * Pixel ID + access token sunt PER-SITE (citite din Site.analytics +
 * Site.analyticsSecrets). Fiecare site din admin are propriile credențiale.
 */
@Injectable()
export class TiktokEventsService {
  private readonly logger = new Logger('TiktokEvents');
  private readonly endpoint = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

  isEnabled(site: Site | null | undefined): boolean {
    const pixelId = site?.analytics?.tiktokPixelId;
    const token = site?.analyticsSecrets?.tiktokAccessToken;
    return !!(pixelId && token);
  }

  /**
   * Trimite un eveniment pentru un site dat. `eventId` trebuie să fie identic
   * cu cel trimis de pixelul browser ca să se facă dedup automat.
   */
  async trackEvent(input: {
    site: Site | null | undefined;
    eventName: 'PageView' | 'ViewContent' | 'InitiateCheckout' | 'Purchase';
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
    const pixelId = input.site?.analytics?.tiktokPixelId;
    const token = input.site?.analyticsSecrets?.tiktokAccessToken;
    if (!pixelId || !token) {
      this.logger.debug(
        `TikTok pixel/token missing for site ${input.site?.slug ?? 'unknown'} — skip`,
      );
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
