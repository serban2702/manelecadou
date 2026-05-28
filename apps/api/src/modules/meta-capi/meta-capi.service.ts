import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { SettingsService } from '../settings/settings.service';

/**
 * Meta Conversions API (server-side) — trimite evenimente din backend pentru
 * deduplicare + bypass ad-blockers + iOS ATT.
 *
 * Setări (din admin /settings):
 *   - META_PIXEL_ID — ID-ul Pixel-ului (ex. "1234567890123456")
 *   - META_CAPI_ACCESS_TOKEN — Access Token Conversions API (din Events Manager)
 *   - META_TEST_EVENT_CODE — opțional, pentru test cu evenimente vizibile în
 *     „Test Events" tab din Events Manager (ex. "TEST12345")
 *
 * Toate apelurile sunt fire-and-forget — nu blochează flow-ul aplicației dacă
 * Meta răspunde greu. Loguri pentru audit.
 *
 * Evenimente standard:
 *   - Lead         — primul mesaj user în chat
 *   - CompleteRegistration — userul a dat email
 *   - AddPaymentInfo — AI a trimis payment_link
 *   - InitiateCheckout — userul a făcut CLICK pe payment_link (din FE)
 *   - Purchase     — Stripe webhook plată confirmată
 *   - ViewContent  — AI a trimis sample audio
 *   - Subscribe    — userul a activat web push
 *
 * Custom events:
 *   - EmotionalIntent — empatie trigger (rudă/copii/etc.)
 *   - DiscountSeeker  — userul a cerut reducere
 *   - EngagedChatter  — userul a trecut de 3 mesaje
 */
@Injectable()
export class MetaCapiService {
  private readonly logger = new Logger('MetaCAPI');
  // Cache settings pentru ~30s ca să nu hit DB la fiecare event.
  private settingsCache: { pixelId: string; token: string; testCode: string; at: number } | null = null;

  constructor(private readonly settings: SettingsService) {}

  /**
   * Trimite un eveniment către Meta Conversions API.
   *
   * @param eventName  - Standard ("Lead", "Purchase" etc.) sau custom („EmotionalIntent")
   * @param data       - Date eveniment: email, phone, ip, ua, value, currency, etc.
   * @param actionSource - „chat" | „website" — pentru atribuire corectă
   */
  async sendEvent(
    eventName: string,
    data: {
      eventId?: string;        // pentru deduplicare client/server
      eventTime?: number;      // unix seconds, default now
      email?: string | null;
      phone?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      externalId?: string | null;  // userId/guestId
      ip?: string | null;
      userAgent?: string | null;
      fbp?: string | null;        // _fbp cookie
      fbc?: string | null;        // _fbc cookie (click ID)
      /** Adresă utilizator — Stripe billing address sau form input. Hash-uite pentru AM. */
      city?: string | null;
      state?: string | null;
      zip?: string | null;
      country?: string | null;
      eventSourceUrl?: string | null;
      value?: number | null;       // în RON (nu cents)
      currency?: string | null;
      contentName?: string | null;
      contentIds?: string[] | null;
      contentCategory?: string | null;
      customData?: Record<string, unknown>;  // pt custom events
    },
    actionSource: 'chat' | 'website' | 'system_generated' = 'chat',
  ): Promise<void> {
    try {
      const cfg = await this.getConfig();
      if (!cfg) {
        this.logger.debug(`skip ${eventName} — Meta CAPI nu e configurat`);
        return;
      }

      const eventId = data.eventId ?? randomEventId();
      const eventTime = data.eventTime ?? Math.floor(Date.now() / 1000);

      const userData: Record<string, unknown> = {};
      if (data.email) userData.em = [sha256(data.email.trim().toLowerCase())];
      if (data.phone) userData.ph = [sha256(normalizePhone(data.phone))];
      if (data.firstName) userData.fn = [sha256(data.firstName.trim().toLowerCase())];
      if (data.lastName) userData.ln = [sha256(data.lastName.trim().toLowerCase())];
      if (data.externalId) userData.external_id = [sha256(data.externalId.trim().toLowerCase())];
      if (data.ip) userData.client_ip_address = data.ip;
      if (data.userAgent) userData.client_user_agent = data.userAgent;
      if (data.fbp) userData.fbp = data.fbp;
      if (data.fbc) userData.fbc = data.fbc;
      // Adresă — hashed pentru advanced matching, conform spec Meta CAPI.
      if (data.city) userData.ct = [sha256(data.city.trim().toLowerCase().replace(/\s+/g, ''))];
      if (data.state) userData.st = [sha256(data.state.trim().toLowerCase().replace(/\s+/g, ''))];
      if (data.zip) userData.zp = [sha256(data.zip.trim().toLowerCase().replace(/\s+/g, ''))];
      if (data.country) userData.country = [sha256(data.country.trim().toLowerCase())];

      const customData: Record<string, unknown> = { ...(data.customData ?? {}) };
      if (data.value !== null && data.value !== undefined) customData.value = data.value;
      if (data.currency) customData.currency = data.currency;
      if (data.contentName) customData.content_name = data.contentName;
      if (data.contentIds) customData.content_ids = data.contentIds;
      if (data.contentCategory) customData.content_category = data.contentCategory;

      const event: Record<string, unknown> = {
        event_name: eventName,
        event_time: eventTime,
        event_id: eventId,
        action_source: actionSource,
        user_data: userData,
        custom_data: customData,
      };
      if (data.eventSourceUrl) event.event_source_url = data.eventSourceUrl;

      const payload: Record<string, unknown> = { data: [event] };
      if (cfg.testCode) payload.test_event_code = cfg.testCode;

      const url = `https://graph.facebook.com/v18.0/${cfg.pixelId}/events?access_token=${encodeURIComponent(cfg.token)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        this.logger.warn(`Meta CAPI ${eventName} ${res.status}: ${text.slice(0, 200)}`);
        return;
      }
      this.logger.log(`Meta CAPI ${eventName} sent (event_id=${eventId.slice(0, 8)})`);
    } catch (e) {
      // Fire-and-forget — Meta down nu blochează flow-ul
      this.logger.warn(`Meta CAPI ${eventName} failed: ${(e as Error).message}`);
    }
  }

  private async getConfig(): Promise<{ pixelId: string; token: string; testCode: string } | null> {
    const now = Date.now();
    if (this.settingsCache && now - this.settingsCache.at < 30_000) {
      return this.settingsCache.pixelId && this.settingsCache.token ? this.settingsCache : null;
    }
    const [pixelId, token, testCode] = await Promise.all([
      this.settings.get('META_PIXEL_ID'),
      this.settings.get('META_CAPI_ACCESS_TOKEN'),
      this.settings.get('META_TEST_EVENT_CODE'),
    ]);
    this.settingsCache = { pixelId: pixelId.trim(), token: token.trim(), testCode: testCode.trim(), at: now };
    return pixelId.trim() && token.trim() ? this.settingsCache : null;
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function normalizePhone(phone: string): string {
  // E.164-like — păstrează doar cifrele, prefix optional „+"
  const clean = phone.replace(/[^\d+]/g, '');
  return clean.startsWith('+') ? clean : `+${clean}`;
}

function randomEventId(): string {
  // UUID v4 simplu, fără dep externă
  return 'ev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
