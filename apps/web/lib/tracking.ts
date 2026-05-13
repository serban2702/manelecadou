'use client';

/**
 * Unified tracking helper — apelează TikTok Pixel + Meta Pixel + GA4 simultan
 * cu nume de evenimente normalizate.
 *
 * Pentru TikTok Events API (server-side), event_id-ul generat aici e trimis și
 * pe backend (din webhook Stripe) — TikTok unește automat browser+server prin
 * `event_id` și nu raportează dublu.
 */

export type TrackEventName =
  | 'PageView'
  | 'ViewContent'
  | 'InitiateCheckout'
  | 'CompletePayment';

interface TrackParams {
  /** Valoare monetară (pentru CompletePayment). */
  value?: number;
  currency?: string;
  /** ID-ul produsului (de obicei generationId). */
  content_id?: string;
  content_name?: string;
  content_type?: 'product' | 'product_group';
  /** Email plain — va fi hash-uit înainte de identify (advanced matching). */
  email?: string;
  /** Override pentru event_id (pentru dedup cu Events API server-side). */
  event_id?: string;
}

/**
 * Generează un event_id unic. Persistăm temporar în sessionStorage cu o cheie
 * derivată din event + content_id ca să-l putem trimite identic și de pe server.
 */
export function makeEventId(event: TrackEventName, contentId?: string): string {
  const base = `${event}:${contentId ?? 'global'}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  return base;
}

declare global {
  interface Window {
    ttq?: {
      track: (event: string, params?: Record<string, unknown>, opts?: { event_id?: string }) => void;
      identify: (params: Record<string, unknown>) => void;
      page: () => void;
    };
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text.trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

let identified = false;
async function identifyOnce(email?: string) {
  if (!email || identified || typeof window === 'undefined') return;
  identified = true;
  try {
    const emailHash = await sha256Hex(email);
    if (window.ttq) window.ttq.identify({ email: emailHash });
  } catch {
    // ignore — identify e best-effort
  }
}

/**
 * Trimite evenimentul către toate pixelii activi. Returnează event_id-ul
 * folosit (poate fi atașat în request-uri către backend ca să trimită
 * același event_id prin Events API → dedup automat).
 */
export function track(event: TrackEventName, params: TrackParams = {}): string {
  if (typeof window === 'undefined') return '';
  const eventId = params.event_id ?? makeEventId(event, params.content_id);

  if (params.email) identifyOnce(params.email);

  // TikTok
  if (window.ttq) {
    try {
      const ttParams: Record<string, unknown> = {};
      if (params.value != null) ttParams.value = params.value;
      if (params.currency) ttParams.currency = params.currency;
      if (params.content_id) {
        ttParams.contents = [{
          content_id: params.content_id,
          content_name: params.content_name,
          content_type: params.content_type ?? 'product',
          quantity: 1,
          price: params.value,
        }];
      }
      window.ttq.track(event, ttParams, { event_id: eventId });
    } catch (e) {
      console.warn('[tracking] ttq.track failed', e);
    }
  }

  // Meta Pixel (mapare similară — denumirile sunt aceleași în mare)
  if (window.fbq) {
    try {
      const fbEvent =
        event === 'CompletePayment' ? 'Purchase' :
        event === 'InitiateCheckout' ? 'InitiateCheckout' :
        event === 'ViewContent' ? 'ViewContent' :
        'PageView';
      const fbParams: Record<string, unknown> = {};
      if (params.value != null) fbParams.value = params.value;
      if (params.currency) fbParams.currency = params.currency;
      if (params.content_id) {
        fbParams.content_ids = [params.content_id];
        fbParams.content_type = params.content_type ?? 'product';
      }
      window.fbq('track', fbEvent, fbParams, { eventID: eventId });
    } catch (e) {
      console.warn('[tracking] fbq failed', e);
    }
  }

  // GA4 — folosim doar pentru evenimentele importante
  if (window.gtag && (event === 'CompletePayment' || event === 'InitiateCheckout')) {
    try {
      window.gtag('event', event === 'CompletePayment' ? 'purchase' : 'begin_checkout', {
        value: params.value,
        currency: params.currency,
        transaction_id: params.content_id,
      });
    } catch (e) {
      console.warn('[tracking] gtag failed', e);
    }
  }

  return eventId;
}

/** PageView simplu (fără content). */
export function trackPageView() {
  if (typeof window === 'undefined') return;
  try {
    if (window.ttq) window.ttq.page();
    if (window.fbq) window.fbq('track', 'PageView');
  } catch {
    // ignore
  }
}
