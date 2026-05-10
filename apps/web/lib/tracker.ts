'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:1501';
const SESSION_KEY = 'mc_session_key';
const VISITOR_KEY = 'mc_visitor_id';
const SESSION_META_KEY = 'mc_session_meta';
const CONSENT_KEY = 'mc_consent_v1';
const SESSION_ENRICHED_KEY = 'mc_session_enriched';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
  interface Navigator {
    connection?: {
      effectiveType?: string;
      downlink?: number;
      saveData?: boolean;
      type?: string;
    };
    mozConnection?: Navigator['connection'];
    webkitConnection?: Navigator['connection'];
  }
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getSessionKey(): string {
  if (typeof window === 'undefined') return 'ssr';
  let v = sessionStorage.getItem(SESSION_KEY);
  if (!v) {
    v = uuid();
    sessionStorage.setItem(SESSION_KEY, v);
  }
  return v;
}

function getVisitorId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let v = localStorage.getItem(VISITOR_KEY);
  if (!v) {
    v = uuid();
    localStorage.setItem(VISITOR_KEY, v);
  }
  return v;
}

interface SessionMeta {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  referrer: string | null;
  device: string;
}

function detectDevice(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua))) return 'tablet';
  if (/mobile|iphone|ipod|android.*mobile|windows phone/.test(ua)) return 'mobile';
  return 'desktop';
}

function readSessionMeta(): SessionMeta {
  if (typeof window === 'undefined') {
    return { source: null, medium: null, campaign: null, utmContent: null, utmTerm: null, referrer: null, device: 'desktop' };
  }
  const cached = sessionStorage.getItem(SESSION_META_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      /* fallthrough */
    }
  }
  const params = new URLSearchParams(window.location.search);
  const ref = document.referrer || null;
  let source = params.get('utm_source');
  const medium = params.get('utm_medium');
  if (!source && ref) {
    try {
      const refHost = new URL(ref).hostname;
      if (refHost && !refHost.endsWith(window.location.hostname)) source = refHost;
    } catch {
      /* ignore */
    }
  }
  const meta: SessionMeta = {
    source: source || (ref ? null : 'direct'),
    medium,
    campaign: params.get('utm_campaign'),
    utmContent: params.get('utm_content'),
    utmTerm: params.get('utm_term'),
    referrer: ref,
    device: detectDevice(),
  };
  sessionStorage.setItem(SESSION_META_KEY, JSON.stringify(meta));
  return meta;
}

interface ClientEnrichment {
  screenWidth: number;
  screenHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  touchCapable: boolean;
  colorScheme: string;
  reducedMotion: boolean;
  language: string;
  timezone: string;
  timezoneOffsetMin: number;
  connectionType: string | null;
  connectionDownlink: number | null;
  saveData: boolean | null;
  doNotTrack: boolean;
}

function readClientEnrichment(): Partial<ClientEnrichment> {
  if (typeof window === 'undefined') return {};
  const out: Partial<ClientEnrichment> = {};
  try {
    out.screenWidth = window.screen?.width;
    out.screenHeight = window.screen?.height;
    out.viewportWidth = window.innerWidth;
    out.viewportHeight = window.innerHeight;
    out.devicePixelRatio = Math.round((window.devicePixelRatio ?? 1) * 100) / 100;
    out.touchCapable = (navigator.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window;
    out.colorScheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    out.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    out.language = navigator.language;
    out.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    out.timezoneOffsetMin = -new Date().getTimezoneOffset();
    const conn = navigator.connection ?? navigator.mozConnection ?? navigator.webkitConnection;
    if (conn) {
      out.connectionType = conn.effectiveType ?? conn.type ?? null;
      out.connectionDownlink = typeof conn.downlink === 'number' ? Math.round(conn.downlink * 100) / 100 : null;
      out.saveData = conn.saveData ?? null;
    }
    out.doNotTrack = navigator.doNotTrack === '1' || (window as unknown as { doNotTrack?: string }).doNotTrack === '1';
  } catch {
    /* ignore */
  }
  return out;
}

// ============ BOT FINGERPRINT ============

function readBotFingerprint(): Record<string, unknown> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return {};
  const out: Record<string, unknown> = {};
  try {
    out.webdriver = (navigator as { webdriver?: boolean }).webdriver === true;
    out.pluginsLength = navigator.plugins?.length ?? 0;
    out.languagesCount = (navigator.languages?.length as number | undefined) ?? 0;
    out.hardwareConcurrency = navigator.hardwareConcurrency ?? null;
    out.deviceMemory = (navigator as { deviceMemory?: number }).deviceMemory ?? null;
    // Headless Chrome are window.chrome === undefined în multe cazuri
    out.hasChromeObj = typeof (window as { chrome?: unknown }).chrome !== 'undefined';
    // PhantomJS / OldHeadless markers
    out.hasPhantom =
      typeof (window as { _phantom?: unknown })._phantom !== 'undefined' ||
      typeof (window as { callPhantom?: unknown }).callPhantom !== 'undefined';
    // Selenium markers
    out.hasSelenium =
      typeof (window as { _selenium?: unknown })._selenium !== 'undefined' ||
      typeof (document as unknown as Document & { _$wdc_?: unknown })._$wdc_ !== 'undefined';
  } catch {
    /* ignore */
  }
  return out;
}

// ============ CONSENT ============

export type ConsentState = 'unknown' | 'granted' | 'denied';

export function getConsent(): ConsentState {
  if (typeof window === 'undefined') return 'unknown';
  const v = localStorage.getItem(CONSENT_KEY);
  if (v === 'granted' || v === 'denied') return v;
  return 'unknown';
}

export function setConsent(state: 'granted' | 'denied') {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CONSENT_KEY, state);
  track({
    type: state === 'granted' ? 'consent_given' : 'consent_denied',
    props: { ts: Date.now() },
  });
  if (state === 'granted') {
    // Dacă userul a refuzat anterior, restartează tracking-ul UI
    initTracker();
  }
}

function isTrackingAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  const enrichment = readClientEnrichment();
  if (enrichment.doNotTrack) return false;
  const c = getConsent();
  // Implicit acceptăm dacă userul nu a refuzat explicit (privacy-friendly mode, dar
  // colectăm prima vizită pentru a putea afișa banner-ul; eventul de page_view e
  // util și fără PII).
  return c !== 'denied';
}

// ============ GA / META ============

const GA_EVENT_NAME: Record<string, string> = {
  page_view: 'page_view',
  purchase_success: 'purchase',
  purchase_init: 'begin_checkout',
  signup: 'sign_up',
  login: 'login',
  generation_start: 'generation_start',
  generation_complete: 'generation_complete',
};

const META_EVENT_NAME: Record<string, string> = {
  page_view: 'PageView',
  purchase_success: 'Purchase',
  purchase_init: 'InitiateCheckout',
  signup: 'CompleteRegistration',
  login: 'Login',
  generation_start: 'AddToCart',
};

interface TrackInput {
  type: string;
  valueCents?: number;
  currency?: string;
  props?: Record<string, unknown>;
}

let queue: Array<Record<string, unknown>> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, 800);
}

async function flush() {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  try {
    if (batch.length === 1) {
      await fetch(`${API_URL}/api/analytics/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch[0]),
        credentials: 'include',
        keepalive: true,
      });
    } else {
      await fetch(`${API_URL}/api/analytics/track/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }),
        credentials: 'include',
        keepalive: true,
      });
    }
  } catch {
    // silent
  }
}

function flushSync(payload: Record<string, unknown>) {
  if (typeof navigator === 'undefined') return;
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    navigator.sendBeacon?.(`${API_URL}/api/analytics/track`, blob);
  } catch {
    /* ignore */
  }
}

export function track(input: TrackInput): string {
  if (typeof window === 'undefined') return '';
  if (!isTrackingAllowed()) return '';
  const eventId = uuid();
  const sessionKey = getSessionKey();
  const visitorId = getVisitorId();
  const meta = readSessionMeta();

  // Trimit enrichment-ul DOAR prima dată per sesiune (pentru a evita payload mare).
  const enriched = sessionStorage.getItem(SESSION_ENRICHED_KEY) === '1';
  const enrichment = enriched ? {} : readClientEnrichment();
  if (!enriched) sessionStorage.setItem(SESSION_ENRICHED_KEY, '1');

  // Bot fingerprint signals — trimise în props o singură dată per sesiune.
  const fingerprint = enriched ? {} : readBotFingerprint();

  const payload = {
    eventId,
    type: input.type,
    sessionKey,
    visitorId,
    url: window.location.href,
    path: window.location.pathname,
    referrer: meta.referrer,
    valueCents: input.valueCents,
    currency: input.currency,
    props: { ...(input.props ?? {}), ...fingerprint },
    source: meta.source,
    medium: meta.medium,
    campaign: meta.campaign,
    utmContent: meta.utmContent,
    utmTerm: meta.utmTerm,
    device: meta.device,
    consentGiven: getConsent() === 'granted',
    ...enrichment,
    ts: Date.now(),
  };

  queue.push(payload);
  scheduleFlush();

  const gaName = GA_EVENT_NAME[input.type] ?? input.type;
  if (typeof window.gtag === 'function') {
    const gaParams: Record<string, unknown> = {
      ...input.props,
      _eid: eventId,
      session_id: sessionKey,
    };
    if (input.valueCents != null) {
      gaParams.value = input.valueCents / 100;
      gaParams.currency = input.currency ?? 'RON';
    }
    if (input.type === 'purchase_success') {
      gaParams.transaction_id = (input.props?.['transaction_id'] as string | undefined) ?? eventId;
    }
    window.gtag('event', gaName, gaParams);
  }

  const metaName = META_EVENT_NAME[input.type] ?? input.type;
  if (typeof window.fbq === 'function') {
    const customData: Record<string, unknown> = { ...input.props };
    if (input.valueCents != null) {
      customData.value = input.valueCents / 100;
      customData.currency = input.currency ?? 'RON';
    }
    window.fbq('track', metaName, customData, { eventID: eventId });
  }

  return eventId;
}

let lastPath: string | null = null;
let pageStartTs = 0;
let scrollMaxPct = 0;
let scrollSent: number[] = [];

export function trackPageView(path?: string) {
  if (typeof window === 'undefined') return;
  const newPath = path ?? window.location.pathname;
  if (newPath === lastPath) return;
  if (lastPath !== null) {
    const duration = Math.max(0, Math.round((Date.now() - pageStartTs) / 1000));
    track({
      type: 'session_end',
      props: { from: lastPath, durationSec: duration, scrollMaxPct },
    });
  }
  lastPath = newPath;
  pageStartTs = Date.now();
  scrollMaxPct = 0;
  scrollSent = [];
  track({ type: 'page_view' });
}

function onScroll() {
  if (typeof window === 'undefined') return;
  const sc = window.scrollY + window.innerHeight;
  const total = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  if (total <= 0) return;
  const pct = Math.min(100, Math.round((sc / total) * 100));
  if (pct > scrollMaxPct) scrollMaxPct = pct;
  for (const threshold of [25, 50, 75, 90]) {
    if (pct >= threshold && !scrollSent.includes(threshold)) {
      scrollSent.push(threshold);
      track({ type: 'scroll_depth', props: { depth: threshold } });
    }
  }
}

function onClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  const a = target.closest('a');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('#')) return;
  try {
    const url = new URL(href, window.location.origin);
    if (url.host !== window.location.host) {
      track({ type: 'outbound_click', props: { href: url.href } });
    }
  } catch {
    /* ignore */
  }
}

// ============ FORM TRACKING ============

interface FormTracker {
  formId: string;
  startedAt: number;
  fields: Set<string>;
  submitted: boolean;
}
const formTrackers = new WeakMap<HTMLFormElement, FormTracker>();

function fieldName(el: HTMLElement): string | null {
  const input = el as HTMLInputElement;
  if (!input.name && !input.id) return null;
  return input.name || input.id || null;
}

function attachFormTracking() {
  if (typeof document === 'undefined') return;
  document.addEventListener(
    'focusin',
    (e) => {
      const t = e.target as HTMLElement;
      if (!t || !(t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const form = (t as HTMLInputElement).form;
      if (!form) return;
      let tracker = formTrackers.get(form);
      if (!tracker) {
        const formId = form.id || form.getAttribute('name') || form.action || 'form_' + Math.random().toString(36).slice(2, 8);
        tracker = { formId, startedAt: Date.now(), fields: new Set(), submitted: false };
        formTrackers.set(form, tracker);
        track({ type: 'form_start', props: { formId } });
      }
      const f = fieldName(t);
      if (f && !tracker.fields.has(f)) {
        tracker.fields.add(f);
        track({ type: 'form_field_change', props: { formId: tracker.formId, field: f } });
      }
    },
    true,
  );

  document.addEventListener(
    'submit',
    (e) => {
      const form = e.target as HTMLFormElement;
      if (!form || form.tagName !== 'FORM') return;
      const tracker = formTrackers.get(form);
      if (!tracker) return;
      tracker.submitted = true;
      track({
        type: 'form_submit',
        props: {
          formId: tracker.formId,
          fieldsTouched: tracker.fields.size,
          durationSec: Math.round((Date.now() - tracker.startedAt) / 1000),
        },
      });
    },
    true,
  );

  // Form abandonment: la beforeunload, dacă userul a interactuat dar n-a făcut submit
  window.addEventListener('beforeunload', () => {
    document.querySelectorAll('form').forEach((form) => {
      const t = formTrackers.get(form as HTMLFormElement);
      if (t && !t.submitted && t.fields.size > 0) {
        flushSync({
          eventId: uuid(),
          type: 'form_abandon',
          sessionKey: getSessionKey(),
          visitorId: getVisitorId(),
          props: {
            formId: t.formId,
            fieldsTouched: t.fields.size,
            durationSec: Math.round((Date.now() - t.startedAt) / 1000),
          },
          ts: Date.now(),
        });
      }
    });
  });
}

// ============ CORE WEB VITALS (without external lib) ============

function attachWebVitals() {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;

  const sendVital = (metric: string, value: number, extra?: Record<string, unknown>) => {
    track({ type: 'web_vital', props: { metric, value: Math.round(value * 100) / 100, ...(extra ?? {}) } });
  };

  // LCP
  try {
    const lcpObs = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1] as PerformanceEntry & { renderTime?: number; loadTime?: number };
      const value = (last as { renderTime?: number; loadTime?: number; startTime: number }).renderTime || (last as { loadTime?: number }).loadTime || last.startTime;
      sendVital('LCP', value);
    });
    lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    /* ignore */
  }

  // FID / INP (interaction)
  try {
    const fidObs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const fe = entry as PerformanceEntry & { processingStart: number; startTime: number };
        sendVital('FID', fe.processingStart - fe.startTime);
      }
    });
    fidObs.observe({ type: 'first-input', buffered: true });
  } catch {
    /* ignore */
  }

  // CLS (cumulative layout shift)
  try {
    let cls = 0;
    let lastCls = 0;
    const clsObs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const ls = entry as PerformanceEntry & { hadRecentInput?: boolean; value: number };
        if (!ls.hadRecentInput) cls += ls.value;
      }
    });
    clsObs.observe({ type: 'layout-shift', buffered: true });
    // Trimit la pagehide
    addEventListener('pagehide', () => {
      if (cls !== lastCls) {
        sendVital('CLS', cls);
        lastCls = cls;
      }
    });
  } catch {
    /* ignore */
  }

  // FCP & TTFB la load
  try {
    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (navEntry) {
      sendVital('TTFB', navEntry.responseStart);
    }
    const paintObs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          sendVital('FCP', entry.startTime);
        }
      }
    });
    paintObs.observe({ type: 'paint', buffered: true });
  } catch {
    /* ignore */
  }
}

let initialized = false;
export function initTracker() {
  if (typeof window === 'undefined' || initialized) return;
  if (!isTrackingAllowed()) return;
  initialized = true;
  getSessionKey();
  getVisitorId();
  trackPageView();

  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('click', onClick, true);

  attachFormTracking();
  attachWebVitals();

  window.addEventListener('beforeunload', () => {
    if (lastPath) {
      const duration = Math.max(0, Math.round((Date.now() - pageStartTs) / 1000));
      flushSync({
        eventId: uuid(),
        type: 'session_end',
        sessionKey: getSessionKey(),
        visitorId: getVisitorId(),
        path: lastPath,
        url: window.location.href,
        props: { durationSec: duration, scrollMaxPct },
        ts: Date.now(),
      });
    }
  });
}

export const analytics = {
  track,
  trackPageView,
  init: initTracker,
  getConsent,
  setConsent,
};
