'use client';

/**
 * Captura UTM din browser — oglinda lui
 * `apps/api/src/modules/analytics/utm-standard.ts`.
 *
 * ȚINE-LE SINCRONIZATE: dacă adaugi un parametru acolo, adaugă-l și aici, și în
 * `TrackEventDto`. Un parametru capturat pe server dar netrimis de client e o
 * coloană goală care arată exact ca „reclamă fără UTM".
 *
 * Două atingeri, nu una:
 *  - ULTIMA (sessionStorage) — de unde a venit sesiunea asta. E cea pe care se
 *    face atribuirea de venit azi.
 *  - PRIMA (localStorage, 90 de zile) — de unde a venit omul prima oară. Fără
 *    ea, un client adus de Meta acum trei zile care revine azi din email apare
 *    ca fiind adus de email, iar reclama care l-a găsit nu primește nimic.
 */

const LAST_TOUCH_KEY = 'mc_utm_v2';
/** Cheia scrisă de versiunea de dinaintea capturii extinse — se migrează o dată. */
const LEGACY_TOUCH_KEY = 'mc_session_meta';
const FIRST_TOUCH_KEY = 'mc_first_touch';
const FIRST_TOUCH_TTL_MS = 90 * 24 * 3600_000;

export const UTM_PARAM_MAP: Array<[param: string, field: keyof UtmCapture, max: number]> = [
  ['utm_source', 'source', 64],
  ['utm_medium', 'medium', 64],
  ['utm_campaign', 'campaign', 128],
  ['utm_content', 'content', 256],
  ['utm_term', 'term', 256],
  ['utm_id', 'utmId', 128],
  ['utm_source_platform', 'sourcePlatform', 64],
  ['utm_creative_format', 'creativeFormat', 64],
  ['utm_marketing_tactic', 'marketingTactic', 64],
  ['utm_adset', 'adset', 256],
  ['utm_adset_id', 'adsetId', 64],
  ['utm_ad', 'ad', 256],
  ['utm_ad_id', 'adId', 64],
  ['utm_placement', 'placement', 64],
];

/** Click-ID-urile platformelor, în ordinea de preferință când apar mai multe. */
export const CLICK_ID_PARAMS: Array<[param: string, source: string]> = [
  ['fbclid', 'meta'],
  ['ttclid', 'tiktok'],
  ['gclid', 'google'],
  ['gbraid', 'google'],
  ['wbraid', 'google'],
  ['msclkid', 'bing'],
  ['twclid', 'x'],
  ['li_fat_id', 'linkedin'],
  ['epik', 'pinterest'],
  ['ScCid', 'snapchat'],
  ['sccid', 'snapchat'],
  ['irclickid', 'impact'],
  ['rdt_cid', 'reddit'],
  // Identificatorul de click al reclamelor din ChatGPT (vezi utm-standard.ts).
  ['oppref', 'chatgpt'],
  ['mc_eid', 'email'],
];

export const EMAIL_CLICK_PARAM = 'mc_eid';

export interface UtmCapture {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  utmId: string | null;
  sourcePlatform: string | null;
  creativeFormat: string | null;
  marketingTactic: string | null;
  adset: string | null;
  adsetId: string | null;
  ad: string | null;
  adId: string | null;
  placement: string | null;
  clickId: string | null;
  clickIdSource: string | null;
  clickIds: Record<string, string> | null;
  emailToken: string | null;
  referrer: string | null;
  landingPath: string | null;
  landingQuery: string | null;
}

export interface FirstTouch {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  landingPath: string | null;
  at: number;
}

function emptyCapture(): UtmCapture {
  return {
    source: null, medium: null, campaign: null, content: null, term: null,
    utmId: null, sourcePlatform: null, creativeFormat: null, marketingTactic: null,
    adset: null, adsetId: null, ad: null, adId: null, placement: null,
    clickId: null, clickIdSource: null, clickIds: null, emailToken: null,
    referrer: null, landingPath: null, landingQuery: null,
  };
}

function decodeParam(v: string | null, max: number): string | null {
  if (v == null) return null;
  let d: string;
  try {
    d = decodeURIComponent(v.replace(/\+/g, ' '));
  } catch {
    d = v.replace(/\+/g, ' ');
  }
  d = d.trim();
  if (!d) return null;
  return d.length > max ? d.slice(0, max) : d;
}

/** Macro netradus de platformă (`{{campaign.name}}`, `__CID__`, `{campaignid}`). */
export function isMacroPlaceholder(v: string | null): boolean {
  if (!v) return true;
  const s = v.trim();
  if (!s) return true;
  return (
    /^\{\{[^}]*\}\}$/.test(s) ||
    /^\{[a-z_]+\}$/i.test(s) ||
    /^__[A-Z_]+__$/.test(s) ||
    /^%[A-Z_]+%$/.test(s)
  );
}

/** Captura brută din URL-ul curent — fără citire din storage. */
function readFromLocation(): UtmCapture {
  const out = emptyCapture();
  if (typeof window === 'undefined') return out;
  const params = new URLSearchParams(window.location.search);
  const val = (name: string, max: number) => {
    const raw = decodeParam(params.get(name), max);
    return raw && !isMacroPlaceholder(raw) ? raw : null;
  };

  for (const [param, field, max] of UTM_PARAM_MAP) {
    (out as unknown as Record<string, unknown>)[field] = val(param, max);
  }

  const ids: Record<string, string> = {};
  for (const [param, source] of CLICK_ID_PARAMS) {
    const raw = decodeParam(params.get(param), 512);
    if (!raw || isMacroPlaceholder(raw)) continue;
    ids[param] = raw;
    if (!out.clickId) {
      out.clickId = raw;
      out.clickIdSource = source;
    }
    if (param === EMAIL_CLICK_PARAM) out.emailToken = raw.slice(0, 64);
  }
  out.clickIds = Object.keys(ids).length ? ids : null;

  const ref = document.referrer || null;
  out.referrer = ref;
  out.landingPath = window.location.pathname;
  // Query string-ul de aterizare, plafonat: e plasa de siguranță când un
  // parametru nou apare în reclame înainte să-l capturăm explicit.
  out.landingQuery = window.location.search ? window.location.search.slice(1, 1024) : null;

  // Sursa în cascadă: UTM explicit → click-id → hostname din referrer.
  // Un `fbclid` fără `utm_source` e tot Meta.
  if (!out.source && out.clickIdSource) out.source = out.clickIdSource;
  if (!out.source && ref) {
    try {
      const refHost = new URL(ref).hostname;
      if (refHost && !refHost.endsWith(window.location.hostname)) out.source = refHost;
    } catch {
      /* referrer invalid */
    }
  }
  if (!out.source && !ref) out.source = 'direct';
  return out;
}

/**
 * Captura sesiunii curente. Se calculează O DATĂ (la prima pagină) și rămâne
 * fixată în sessionStorage: dacă omul navighează mai departe, paginile
 * următoare nu mai au UTM în URL și fără fixare sesiunea ar deveni „direct"
 * de la a doua pagină.
 */
export function getSessionCapture(): UtmCapture {
  if (typeof window === 'undefined') return emptyCapture();
  try {
    const cached = sessionStorage.getItem(LAST_TOUCH_KEY);
    if (cached) return { ...emptyCapture(), ...(JSON.parse(cached) as Partial<UtmCapture>) };
  } catch {
    /* private mode sau JSON corupt — recalculăm */
  }

  const capture = readFromLocation();
  // Migrare din formatul vechi: la primul deploy, sesiunile deja deschise n-au
  // UTM în URL-ul paginii curente. Fără pasul ăsta ar deveni brusc „direct".
  try {
    const legacy = sessionStorage.getItem(LEGACY_TOUCH_KEY);
    if (legacy) {
      const prev = JSON.parse(legacy) as {
        source?: string | null; medium?: string | null; campaign?: string | null;
        utmContent?: string | null; utmTerm?: string | null; referrer?: string | null;
      };
      if (!capture.source && prev.source) capture.source = prev.source;
      if (!capture.medium && prev.medium) capture.medium = prev.medium;
      if (!capture.campaign && prev.campaign) capture.campaign = prev.campaign;
      if (!capture.content && prev.utmContent) capture.content = prev.utmContent;
      if (!capture.term && prev.utmTerm) capture.term = prev.utmTerm;
      if (!capture.referrer && prev.referrer) capture.referrer = prev.referrer;
    }
  } catch {
    /* formatul vechi lipsește sau e corupt */
  }

  try {
    sessionStorage.setItem(LAST_TOUCH_KEY, JSON.stringify(capture));
  } catch {
    /* private mode */
  }
  rememberFirstTouch(capture);
  return capture;
}

/** Prima atingere: se scrie o singură dată și nu se mai suprascrie 90 de zile. */
function rememberFirstTouch(capture: UtmCapture): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(FIRST_TOUCH_KEY);
    if (raw) {
      const prev = JSON.parse(raw) as FirstTouch;
      if (prev && typeof prev.at === 'number' && Date.now() - prev.at < FIRST_TOUCH_TTL_MS) return;
    }
    // Nu înregistrăm „direct" ca primă atingere: ar bloca 90 de zile prima
    // sursă reală care urmează (omul deschide site-ul din istoric, apoi vine
    // pe reclamă). Primul touch care contează e primul cu o sursă adevărată.
    if (!capture.source || capture.source === 'direct') return;
    const first: FirstTouch = {
      source: capture.source,
      medium: capture.medium,
      campaign: capture.campaign,
      landingPath: capture.landingPath,
      at: Date.now(),
    };
    localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(first));
  } catch {
    /* private mode */
  }
}

export function getFirstTouch(): FirstTouch | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(FIRST_TOUCH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FirstTouch;
    if (!parsed || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > FIRST_TOUCH_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Payload-ul de atribuire, plat, gata de trimis la `/api/analytics/track` și de
 * atașat la crearea checkout-ului. Câmpurile null sunt omise ca să nu umflăm
 * fiecare eveniment cu 25 de chei goale.
 */
export function attributionPayload(): Record<string, unknown> {
  const c = getSessionCapture();
  const first = getFirstTouch();
  const out: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => {
    if (v != null && v !== '') out[k] = v;
  };
  put('source', c.source);
  put('medium', c.medium);
  put('campaign', c.campaign);
  put('utmContent', c.content);
  put('utmTerm', c.term);
  put('utmId', c.utmId);
  put('utmSourcePlatform', c.sourcePlatform);
  put('utmCreativeFormat', c.creativeFormat);
  put('utmMarketingTactic', c.marketingTactic);
  put('adsetName', c.adset);
  put('adsetId', c.adsetId);
  put('adName', c.ad);
  put('adId', c.adId);
  put('placement', c.placement);
  put('clickId', c.clickId);
  put('clickIdSource', c.clickIdSource);
  put('clickIds', c.clickIds);
  put('emailToken', c.emailToken);
  put('landingQuery', c.landingQuery);
  if (first) {
    put('firstSource', first.source);
    put('firstMedium', first.medium);
    put('firstCampaign', first.campaign);
    put('firstLandingPath', first.landingPath);
    put('firstTouchAt', first.at);
  }
  return out;
}
