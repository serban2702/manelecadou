import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { AnalyticsEvent } from './analytics-event.entity';
import { SitesService } from '../sites/sites.service';
import type { Site } from '../sites/site.entity';

/**
 * Forwarder server-side pentru GA4 (Measurement Protocol) și Meta Pixel (Conversions API).
 * Trimite EVENIMENT cu același eventId/event_id ca clientul → permite GA/Meta să facă dedup.
 * Astfel obținem dublă verificare: dacă clientul nu a apucat să trimită (adblock, beforeunload),
 * server-side completează — și statistica internă rămâne sursa primă pentru cross-check.
 *
 * Configurația e per-site (din `Site.analytics` + `Site.analyticsSecrets`); env-urile globale
 * (`GA4_MEASUREMENT_ID`, `GA4_API_SECRET`, `META_PIXEL_ID`, `META_CAPI_TOKEN`) rămân ca
 * fallback dacă site-ul nu are nimic setat — util pentru un singur tenant de tranziție.
 */
@Injectable()
export class AnalyticsForwarders {
  private readonly logger = new Logger('AnalyticsForwarders');

  constructor(
    private readonly config: ConfigService,
    private readonly sites: SitesService,
  ) {}

  /** Configurare GA4 efectivă pentru un site (per-site cu fallback la env). */
  private ga4ConfigFor(site: Site | null): { measurementId: string; apiSecret: string } | null {
    const measurementId = site?.analytics?.ga4Id || this.config.get<string>('GA4_MEASUREMENT_ID') || '';
    const apiSecret =
      site?.analyticsSecrets?.ga4ApiSecret || this.config.get<string>('GA4_API_SECRET') || '';
    if (!measurementId || !apiSecret) return null;
    return { measurementId, apiSecret };
  }

  /** Configurare CAPI efectivă pentru un site (per-site cu fallback la env). */
  private capiConfigFor(site: Site | null): { pixelId: string; token: string } | null {
    const pixelId = site?.analytics?.metaPixelId || this.config.get<string>('META_PIXEL_ID') || '';
    const token =
      site?.analyticsSecrets?.metaCapiToken || this.config.get<string>('META_CAPI_TOKEN') || '';
    if (!pixelId || !token) return null;
    return { pixelId, token };
  }

  /**
   * Returnează true dacă cel puțin un site activ are CAPI configurat (sau env-ul global).
   * Folosit doar pentru raportarea agregată în admin (`pixelCrossCheck`). Pentru
   * decizia per-eveniment se folosește `capiConfigFor(site)`.
   */
  async anyCapiConfigured(siteId: string | null = null): Promise<boolean> {
    if (siteId) {
      const s = await this.sites.findById(siteId).catch(() => null);
      return !!this.capiConfigFor(s);
    }
    // Fallback rapid: dacă env-ul global e setat, e suficient.
    if (this.capiConfigFor(null)) return true;
    const list = await this.sites.listAll().catch(() => [] as Site[]);
    return list.some((s) => !!this.capiConfigFor(s));
  }

  async anyGa4Configured(siteId: string | null = null): Promise<boolean> {
    if (siteId) {
      const s = await this.sites.findById(siteId).catch(() => null);
      return !!this.ga4ConfigFor(s);
    }
    if (this.ga4ConfigFor(null)) return true;
    const list = await this.sites.listAll().catch(() => [] as Site[]);
    return list.some((s) => !!this.ga4ConfigFor(s));
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

  async sendGA4(
    event: AnalyticsEvent,
    userEmail: string | null,
    cfg: { measurementId: string; apiSecret: string },
  ): Promise<void> {
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(
      cfg.measurementId,
    )}&api_secret=${encodeURIComponent(cfg.apiSecret)}`;

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

  async sendMetaCAPI(
    event: AnalyticsEvent,
    userEmail: string | null,
    cfg: { pixelId: string; token: string },
  ): Promise<void> {
    const url = `https://graph.facebook.com/v19.0/${cfg.pixelId}/events?access_token=${encodeURIComponent(cfg.token)}`;

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

  async forward(
    event: AnalyticsEvent,
    userEmail: string | null,
  ): Promise<{ ok: boolean; attempted: boolean; error?: string }> {
    // Încărcăm site-ul pentru a obține configul propriu (pixelId, token, GA4 id/secret).
    // Pentru evenimente fără siteId (rare — cross-tenant admin) folosim doar env-ul global.
    const site = event.siteId ? await this.sites.findById(event.siteId).catch(() => null) : null;
    const ga4 = this.ga4ConfigFor(site);
    const capi = this.capiConfigFor(site);

    const tasks: Promise<unknown>[] = [];
    if (ga4) tasks.push(this.sendGA4(event, userEmail, ga4));
    if (capi) tasks.push(this.sendMetaCAPI(event, userEmail, capi));
    if (tasks.length === 0) return { ok: true, attempted: false };

    try {
      await Promise.all(tasks);
      return { ok: true, attempted: true };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(`forward failed for event ${event.eventId} (${event.type}): ${msg}`);
      return { ok: false, attempted: true, error: msg };
    }
  }
}
