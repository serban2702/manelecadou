import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Site } from '../sites/site.entity';

/**
 * OpenAI Ads — Conversions API (server-side), perechea pixelului din browser.
 *
 * Docs: https://developers.openai.com/ads/conversions-api
 * Endpoint: `POST https://bzr.openai.com/v1/events?pid=<pixelId>`
 *
 * De ce există, deși pixelul din browser trimite deja aceleași evenimente:
 * plata se confirmă prin webhook-ul Stripe, care vine 100% din partea Stripe —
 * chiar dacă omul a închis tabul imediat după ce a apăsat „Plătește". Pe calea
 * de browser, exact conversiile care contează cel mai mult (cele de pe mobil,
 * unde tabul moare la primul telefon primit) sunt cele care se pierd.
 *
 * Deduplicarea e pe `event_id`: browserul și serverul trimit ACELAȘI id
 * (`pay-<paymentId>`), iar OpenAI păstrează primul eveniment primit și îl
 * ignoră pe al doilea. Nu e o optimizare — fără id comun, fiecare plată ar fi
 * raportată de două ori.
 *
 * Pixel ID + cheia sunt PER-SITE (`Site.analytics` + `Site.analyticsSecrets`),
 * la fel ca la Meta și TikTok.
 */

/** Numele standard de evenimente pe care le trimitem. */
export type OpenAiAdsEvent =
  | 'page_viewed'
  | 'contents_viewed'
  | 'items_added'
  | 'checkout_started'
  | 'order_created'
  | 'lead_created'
  | 'registration_completed'
  | 'appointment_scheduled'
  | 'subscription_created'
  | 'trial_started';

/** Forma obiectului `data`, aleasă de câmpul `type`. */
export type OpenAiAdsDataType = 'contents' | 'customer_action' | 'plan_enrollment' | 'custom';

export interface OpenAiAdsUser {
  email?: string | null;
  phone?: string | null;
  /** Identificator stabil și pseudonim din sistemul nostru (userId / guestId). */
  externalId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  country?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
}

export interface OpenAiAdsEventInput {
  site: Site | null | undefined;
  event: OpenAiAdsEvent;
  /** Identic cu cel trimis de pixelul din browser. Fără el, plata se numără de două ori. */
  eventId: string;
  dataType?: OpenAiAdsDataType;
  /** Suma în unități MINORE (bani/cenți), număr întreg. 12999 = 129,99. */
  amountMinor?: number | null;
  currency?: string | null;
  contents?: Array<{
    id: string;
    name?: string;
    contentType?: string;
    quantity?: number;
    amountMinor?: number;
    currency?: string;
  }>;
  planId?: string | null;
  sourceUrl?: string | null;
  timestampMs?: number;
  user?: OpenAiAdsUser;
  /** `true` = OpenAI validează payload-ul și NU înregistrează nimic. Pentru testul din admin. */
  validateOnly?: boolean;
}

export interface OpenAiAdsSendResult {
  sent: boolean;
  status?: number;
  /** Corpul răspunsului, plafonat. Îl păstrăm ca să se vadă imediat o formă respinsă. */
  body?: string;
  skippedReason?: string;
}

@Injectable()
export class OpenAiAdsService {
  private readonly logger = new Logger('OpenAiAds');
  private readonly endpoint = 'https://bzr.openai.com/v1/events';

  isEnabled(site: Site | null | undefined): boolean {
    return Boolean(site?.analytics?.openaiPixelId && site?.analyticsSecrets?.openaiConversionsApiKey);
  }

  /**
   * Trimite un eveniment. Nu aruncă niciodată: un raport de conversie ratat nu
   * are voie să rupă webhook-ul de plată în care e apelat.
   */
  async sendEvent(input: OpenAiAdsEventInput): Promise<OpenAiAdsSendResult> {
    const pixelId = input.site?.analytics?.openaiPixelId?.trim();
    const apiKey = input.site?.analyticsSecrets?.openaiConversionsApiKey?.trim();
    if (!pixelId || !apiKey) {
      const reason = !pixelId ? 'pixel ID lipsă' : 'cheie Conversions API lipsă';
      this.logger.debug(`OpenAI Ads sărit pentru ${input.site?.slug ?? 'site necunoscut'}: ${reason}`);
      return { sent: false, skippedReason: reason };
    }

    const body = {
      validate_only: input.validateOnly === true,
      events: [this.buildEvent(input)],
    };

    try {
      const res = await fetch(`${this.endpoint}?pid=${encodeURIComponent(pixelId)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const text = (await res.text().catch(() => '')).slice(0, 1000);
      if (!res.ok) {
        // Corpul întreg în log, intenționat: dacă OpenAI schimbă forma cerută
        // sau respinge un câmp, singurul loc unde se vede e răspunsul lui.
        this.logger.warn(
          `OpenAI Ads ${input.event} (id=${input.eventId}) respins: ${res.status} ${text}`,
        );
        return { sent: false, status: res.status, body: text };
      }
      this.logger.log(
        `OpenAI Ads ${input.event} trimis (event_id=${input.eventId}${input.validateOnly ? ', validate_only' : ''})`,
      );
      return { sent: true, status: res.status, body: text };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(`OpenAI Ads request eșuat (${input.event}): ${msg}`);
      return { sent: false, body: msg };
    }
  }

  /** Construiește un eveniment din payload-ul nostru intern. Exportat pentru teste. */
  buildEvent(input: OpenAiAdsEventInput): Record<string, unknown> {
    const dataType: OpenAiAdsDataType = input.dataType ?? 'contents';
    const data: Record<string, unknown> = { type: dataType };

    // `amount` merge în unități MINORE și ÎNTREG (12999 = 129,99 lei). Trimis ca
    // 129.99, OpenAI l-ar citi ca 1,29 lei — o campanie ar părea de 100 de ori
    // mai puțin profitabilă decât e.
    if (input.amountMinor != null) data.amount = Math.round(input.amountMinor);
    if (input.currency) data.currency = input.currency.toUpperCase();
    if (dataType === 'plan_enrollment' && input.planId) data.plan_id = input.planId;
    if (dataType === 'contents' && input.contents?.length) {
      data.contents = input.contents.map((c) => {
        const item: Record<string, unknown> = { id: c.id };
        if (c.name) item.name = c.name;
        item.content_type = c.contentType ?? 'product';
        if (c.quantity != null) item.quantity = Math.round(c.quantity);
        if (c.amountMinor != null) item.amount = Math.round(c.amountMinor);
        if (c.currency) item.currency = c.currency.toUpperCase();
        return item;
      });
    }

    const event: Record<string, unknown> = {
      id: input.eventId,
      type: input.event,
      timestamp_ms: input.timestampMs ?? Date.now(),
      action_source: 'web',
      data,
    };
    if (input.sourceUrl) event.source_url = input.sourceUrl;

    const user = buildUserPayload(input.user);
    if (user) event.user = user;
    return event;
  }
}

// ====================== normalizare + hashing ======================
//
// Regulile sunt ale OpenAI, nu ale noastre, și diferă de cele ale lui Meta sau
// TikTok în detalii care contează: la nume se PĂSTREAZĂ diacriticele („josé"
// rămâne „josé", nu devine „jose"), iar la telefon se taie prefixul `+` și
// zerourile din față, dar se ține codul de țară. O normalizare greșită nu dă
// eroare — dă pur și simplu zero potriviri, tăcut.

/** Trim + lowercase. */
export function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

/**
 * Păstrează codul de țară. Scoate spații, paranteze, puncte și liniuțe, apoi
 * `+` din față și zerourile din față. `+1 (415) 555-2671` → `14155552671`.
 */
export function normalizePhone(v: string): string {
  const stripped = v.replace(/[\s().-]/g, '');
  return stripped.replace(/^\+/, '').replace(/^0+/, '');
}

/**
 * Lowercase, fără spații și fără punctuație ASCII. Caracterele non-ASCII se
 * păstrează: `O'Connor` → `oconnor`, `José` → `josé`.
 */
export function normalizeName(v: string): string {
  return v
    .toLowerCase()
    .replace(/\s+/g, '')
    // Punctuația ASCII, scrisă pe puncte de cod ca să nu depindă de cum
    // interpretează cineva o clasă de caractere cu `[` și `` ` `` înăuntru.
    .replace(/[\u0021-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007e]/g, '');
}

/** SHA-256 al valorii normalizate, în hex minuscul pe 64 de caractere. */
function sha256Hex(v: string): string {
  return createHash('sha256').update(v, 'utf8').digest('hex');
}

/**
 * Obiectul `user` cu identificatorii deja hash-uiți. Trimitem doar câmpurile pe
 * care le avem — un hash al șirului gol ar fi un identificator valid sintactic
 * care nu se potrivește cu nimeni, dar strică rata de potrivire raportată.
 */
export function buildUserPayload(u: OpenAiAdsUser | undefined): Record<string, unknown> | null {
  if (!u) return null;
  const out: Record<string, unknown> = {};

  const email = u.email?.trim();
  if (email) out.email_sha256 = sha256Hex(normalizeEmail(email));

  const phone = u.phone?.trim();
  if (phone) {
    const digits = normalizePhone(phone);
    // Sub 8 cifre nu e un număr internațional valid; peste 15 nu există. Un
    // hash pe o valoare invalidă e zgomot curat.
    if (digits.length >= 8 && digits.length <= 15 && /^\d+$/.test(digits)) {
      out.phone_number_sha256 = sha256Hex(digits);
    }
  }

  const externalId = u.externalId?.trim();
  if (externalId) out.external_id_sha256 = sha256Hex(externalId);

  const first = u.firstName?.trim();
  if (first) {
    const n = normalizeName(first);
    if (n) out.first_name_sha256 = sha256Hex(n);
  }
  const last = u.lastName?.trim();
  if (last) {
    const n = normalizeName(last);
    if (n) out.last_name_sha256 = sha256Hex(n);
  }

  // Câmpurile geografice se trimit în clar (documentat).
  const country = u.country?.trim();
  if (country) out.country = country.toUpperCase().slice(0, 2);
  const city = u.city?.trim();
  if (city) out.city = city.slice(0, 128);
  const region = u.region?.trim();
  if (region) out.region = region.slice(0, 128);
  const postal = u.postalCode?.trim();
  if (postal) out.postal_code = postal.slice(0, 32);

  return Object.keys(out).length > 0 ? out : null;
}

/** Împarte un nume complet în prenume + restul. „Ion Popescu Vasile" → ['Ion', 'Popescu Vasile']. */
export function splitFullName(full: string | null | undefined): { first: string | null; last: string | null } {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}
