import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { AnalyticsEvent } from './analytics-event.entity';

/**
 * Forwarder server-side pentru GA4 (Measurement Protocol) și Meta Pixel (Conversions API).
 * Trimite EVENIMENT cu același eventId/event_id ca clientul → permite GA/Meta să facă dedup.
 * Astfel obținem dublă verificare: dacă clientul nu a apucat să trimită (adblock, beforeunload),
 * server-side completează — și statistica internă rămâne sursa primă pentru cross-check.
 */
@Injectable()
export class AnalyticsForwarders {
  private readonly logger = new Logger('AnalyticsForwarders');

  constructor(private readonly config: ConfigService) {}

  get ga4Configured() {
    return !!this.config.get<string>('GA4_MEASUREMENT_ID') && !!this.config.get<string>('GA4_API_SECRET');
  }
  get capiConfigured() {
    return !!this.config.get<string>('META_PIXEL_ID') && !!this.config.get<string>('META_CAPI_TOKEN');
  }

  /** Hash SHA256 lower-case pentru PII (cerut de Meta CAPI). */
  private hash(value: string | null | undefined): string | undefined {
    if (!value) return undefined;
    return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
  }

  /**
   * Mapping intern → GA4 event name (folosește standard, fallback la custom).
   */
  private gaEventName(type: string): string {
    switch (type) {
      case 'page_view':
        return 'page_view';
      case 'purchase_success':
        return 'purchase';
      case 'signup':
        return 'sign_up';
      case 'login':
        return 'login';
      case 'purchase_init':
        return 'begin_checkout';
      default:
        return type;
    }
  }

  private metaEventName(type: string): string {
    switch (type) {
      case 'page_view':
        return 'PageView';
      case 'purchase_success':
        return 'Purchase';
      case 'purchase_init':
        return 'InitiateCheckout';
      case 'signup':
        return 'CompleteRegistration';
      case 'login':
        return 'Login';
      case 'generation_start':
        return 'AddToCart';
      default:
        return type;
    }
  }

  async sendGA4(event: AnalyticsEvent, userEmail: string | null): Promise<void> {
    if (!this.ga4Configured) return;
    const measurementId = this.config.get<string>('GA4_MEASUREMENT_ID')!;
    const apiSecret = this.config.get<string>('GA4_API_SECRET')!;
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(
      measurementId,
    )}&api_secret=${encodeURIComponent(apiSecret)}`;

    // GA4 client_id trebuie să fie stabil per device — folosim visitorId ca atare.
    const clientId = event.visitorId || event.sessionKey;
    const params: Record<string, unknown> = {
      ...(event.props ?? {}),
      session_id: event.sessionKey,
      page_location: event.url ?? undefined,
      page_path: event.path ?? undefined,
      page_referrer: event.referrer ?? undefined,
    };
    if (event.type === 'purchase_success' && event.valueCents != null) {
      params.transaction_id = (event.props as Record<string, unknown> | null)?.['transaction_id'] ?? event.eventId;
      params.value = event.valueCents / 100;
      params.currency = event.currency ?? 'RON';
    }

    const body = {
      client_id: clientId,
      user_id: event.userId ?? undefined,
      events: [
        {
          name: this.gaEventName(event.type),
          params: { engagement_time_msec: 1, ...params, _eid: event.eventId },
        },
      ],
      user_properties: userEmail
        ? { email_hash: { value: this.hash(userEmail) } }
        : undefined,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`GA4 ${res.status}: ${txt.slice(0, 200)}`);
    }
  }

  async sendMetaCAPI(event: AnalyticsEvent, userEmail: string | null): Promise<void> {
    if (!this.capiConfigured) return;
    const pixelId = this.config.get<string>('META_PIXEL_ID')!;
    const token = this.config.get<string>('META_CAPI_TOKEN')!;
    const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`;

    const userData: Record<string, unknown> = {
      client_user_agent: event.userAgent ?? undefined,
      client_ip_address: event.ip ?? undefined,
    };
    if (userEmail) userData.em = [this.hash(userEmail)];
    if (event.userId) userData.external_id = [this.hash(event.userId)];

    const customData: Record<string, unknown> = {};
    if (event.valueCents != null) {
      customData.value = event.valueCents / 100;
      customData.currency = event.currency ?? 'RON';
    }
    Object.assign(customData, event.props ?? {});

    const body = {
      data: [
        {
          event_name: this.metaEventName(event.type),
          event_time: Math.floor(new Date(event.createdAt).getTime() / 1000),
          event_id: event.eventId,
          event_source_url: event.url ?? undefined,
          action_source: 'website',
          user_data: userData,
          custom_data: customData,
        },
      ],
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Meta CAPI ${res.status}: ${txt.slice(0, 200)}`);
    }
  }

  async forward(event: AnalyticsEvent, userEmail: string | null): Promise<{ ok: boolean; error?: string }> {
    const tasks: Promise<unknown>[] = [];
    if (this.ga4Configured) tasks.push(this.sendGA4(event, userEmail));
    if (this.capiConfigured) tasks.push(this.sendMetaCAPI(event, userEmail));
    if (tasks.length === 0) return { ok: true };

    try {
      await Promise.all(tasks);
      return { ok: true };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(`forward failed for event ${event.eventId} (${event.type}): ${msg}`);
      return { ok: false, error: msg };
    }
  }
}
