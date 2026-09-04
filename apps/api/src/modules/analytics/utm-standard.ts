/**
 * STANDARDUL UTM AL PLATFORMEI — sursa unică de adevăr.
 *
 * Aici trăiesc, într-un singur loc:
 *  1. lista parametrilor pe care îi capturăm din URL (UTM + click-id-uri);
 *  2. vocabularul canonic (`utm_source` / `utm_medium` permise);
 *  3. maparea sursă brută → canal canonic (`channel`);
 *  4. șabloanele gata de lipit în Meta / TikTok / Google / ChatGPT / email.
 *
 * De ce un fișier și nu documentație: „ce UTM punem în reclamă" trebuie să dea
 * exact același răspuns în trei locuri — tracker-ul din browser care capturează,
 * SQL-ul care agregă și pagina din admin de unde copiezi linkul. Când răspunsul
 * a stat în capul cuiva, campaniile au ajuns cu `utm_campaign=__CAMPAIGN_NAME__`
 * netradus și cu `utm_source` scris în patru feluri (`fb`, `FB`, `facebook`,
 * `Facebook`) — vezi `isPlaceholderCampaign` din `attribution-sql.ts`.
 *
 * OGLINDĂ: `apps/web/lib/utm.ts` capturează aceiași parametri în browser.
 * Dacă adaugi un parametru aici, adaugă-l și acolo (și în `TrackEventDto`).
 */

// ============================================================================
// 1. PARAMETRII CAPTURAȚI
// ============================================================================

/** Parametrii UTM standard (Google Analytics) + extensiile noastre. */
export const UTM_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
  'utm_source_platform',
  'utm_creative_format',
  'utm_marketing_tactic',
  // Extensii proprii, standardizate — platformele expun macro-uri pentru ele,
  // dar nu există un `utm_*` oficial. Numele sunt alese să nu se ciocnească.
  'utm_adset',
  'utm_adset_id',
  'utm_ad',
  'utm_ad_id',
  'utm_placement',
] as const;

export type UtmParam = (typeof UTM_PARAMS)[number];

/**
 * Click-ID-urile platformelor, în ordinea în care le preferăm când apar mai
 * multe pe același URL (se întâmplă la redirect-uri între platforme).
 *
 * Click-ID-ul e mai valoros decât UTM-ul: e pus de platformă, nu de om, deci
 * supraviețuiește unei greșeli de tag. `fbclid` prezent înseamnă Meta chiar
 * dacă `utm_source` lipsește complet.
 */
export const CLICK_ID_PARAMS: Array<{ param: string; source: string; channel: string }> = [
  { param: 'fbclid', source: 'meta', channel: 'meta' },
  { param: 'ttclid', source: 'tiktok', channel: 'tiktok' },
  { param: 'gclid', source: 'google', channel: 'google' },
  { param: 'gbraid', source: 'google', channel: 'google' },
  { param: 'wbraid', source: 'google', channel: 'google' },
  { param: 'msclkid', source: 'bing', channel: 'bing' },
  { param: 'twclid', source: 'x', channel: 'x' },
  { param: 'li_fat_id', source: 'linkedin', channel: 'linkedin' },
  { param: 'epik', source: 'pinterest', channel: 'pinterest' },
  { param: 'ScCid', source: 'snapchat', channel: 'snapchat' },
  { param: 'sccid', source: 'snapchat', channel: 'snapchat' },
  { param: 'irclickid', source: 'impact', channel: 'affiliate' },
  { param: 'rdt_cid', source: 'reddit', channel: 'reddit' },
  // `oppref` e identificatorul de click al reclamelor din ChatGPT: OpenAI îl
  // pune pe URL-ul de aterizare, iar pixelul lui îl mută în cookie-ul
  // `__oppref`. Îl citim și noi din URL, exact ca pe `fbclid` — așa o reclamă
  // ChatGPT rămâne atribuită chiar dacă UTM-urile lipsesc.
  { param: 'oppref', source: 'chatgpt', channel: 'chatgpt' },
  // Click-ID-ul nostru pentru linkurile din email (vezi modulul email-tracking).
  { param: 'mc_eid', source: 'email', channel: 'email' },
];

/** Numele parametrului nostru de urmărire a linkurilor din email. */
export const EMAIL_CLICK_PARAM = 'mc_eid';

// ============================================================================
// 2. VOCABULARUL CANONIC
// ============================================================================

/** `utm_source` permise. Orice altceva e acceptat, dar semnalat ca abatere. */
export const UTM_SOURCES: Array<{ value: string; label: string; channel: string }> = [
  { value: 'meta', label: 'Meta Ads (Facebook + Instagram)', channel: 'meta' },
  { value: 'facebook', label: 'Facebook (organic sau reclamă doar FB)', channel: 'meta' },
  { value: 'instagram', label: 'Instagram (organic sau reclamă doar IG)', channel: 'meta' },
  { value: 'tiktok', label: 'TikTok Ads', channel: 'tiktok' },
  { value: 'google', label: 'Google Ads (Search / PMax / Display)', channel: 'google' },
  { value: 'youtube', label: 'YouTube (Ads sau organic)', channel: 'youtube' },
  { value: 'chatgpt', label: 'ChatGPT / OpenAI Ads', channel: 'chatgpt' },
  { value: 'bing', label: 'Microsoft Ads (Bing)', channel: 'bing' },
  { value: 'pinterest', label: 'Pinterest Ads', channel: 'pinterest' },
  { value: 'snapchat', label: 'Snapchat Ads', channel: 'snapchat' },
  { value: 'x', label: 'X (Twitter)', channel: 'x' },
  { value: 'linkedin', label: 'LinkedIn', channel: 'linkedin' },
  { value: 'reddit', label: 'Reddit', channel: 'reddit' },
  { value: 'email', label: 'Emailurile noastre (recuperare, campanii, tranzacționale)', channel: 'email' },
  { value: 'sms', label: 'SMS / WhatsApp business', channel: 'sms' },
  { value: 'whatsapp', label: 'WhatsApp (share între oameni)', channel: 'whatsapp' },
  { value: 'telegram', label: 'Telegram', channel: 'telegram' },
  { value: 'influencer', label: 'Colaborare cu un creator', channel: 'influencer' },
  { value: 'partner', label: 'Partener / afiliat', channel: 'affiliate' },
  { value: 'qr', label: 'Cod QR (flyer, ambalaj, eveniment)', channel: 'offline' },
];

/** `utm_medium` permise — tipul de trafic, nu platforma. */
export const UTM_MEDIUMS: Array<{ value: string; label: string; when: string }> = [
  { value: 'paid_social', label: 'Reclamă în feed social', when: 'Meta, TikTok, Pinterest, Snapchat, Reddit' },
  { value: 'cpc', label: 'Reclamă plătită la click, pe intenție', when: 'Google Search, Bing, Google Shopping' },
  { value: 'paid_ai', label: 'Reclamă în asistent AI', when: 'ChatGPT / OpenAI Ads' },
  { value: 'paid_video', label: 'Reclamă video', when: 'YouTube Ads, TikTok Spark' },
  { value: 'display', label: 'Bannere / Performance Max / retargeting display', when: 'Google Display, PMax' },
  { value: 'email', label: 'Email trimis de noi', when: 'recuperare, campanii, tranzacționale' },
  { value: 'organic_social', label: 'Postare organică', when: 'pagina noastră, story, reel nesponsorizat' },
  { value: 'influencer', label: 'Conținut de la un creator', when: 'colaborări plătite sau barter' },
  { value: 'affiliate', label: 'Afiliat / partener cu comision', when: 'linkuri de partener' },
  { value: 'referral', label: 'Link de pe alt site', when: 'presă, bloguri, directoare' },
  { value: 'sms', label: 'SMS / mesaj direct', when: 'campanii SMS, WhatsApp business' },
  { value: 'offline', label: 'Offline (QR, flyer, ambalaj)', when: 'materiale tipărite' },
];

/**
 * Canalul canonic al unei surse brute. Vocabular NOU, mai curat decât
 * `normalizeSource` din `attribution-sql.ts` (care rămâne neschimbat, ca să nu
 * rupă rapoartele existente): aici Facebook și Instagram se unesc în `meta`,
 * fiindcă o campanie Meta livrează pe ambele și defalcarea corectă e
 * `utm_placement`, nu sursa.
 */
export function normalizeChannel(raw: string | null | undefined): string {
  if (raw == null) return 'direct';
  const s = String(raw).toLowerCase().trim();
  if (!s || s === 'direct' || s === '(direct)' || s === '(none)') return 'direct';

  // Emailul ÎNAINTE de google: `com.google.android.gm` și `mail.google.com`
  // conțin „google", dar sunt clientul de mail, nu Google Ads (§12 din CLAUDE.md).
  if (
    s === 'email' ||
    s === 'e-mail' ||
    s === 'newsletter' ||
    s === 'com.google.android.gm' ||
    s === 'com.microsoft.office.outlook' ||
    s.startsWith('mail.') ||
    s.startsWith('com.yahoo.mobile') ||
    s.startsWith('com.google.android.gm') ||
    s.includes('.mail.') ||
    s.includes('webmail') ||
    s.includes('mail.google') ||
    s.includes('mail.yahoo') ||
    s.includes('outlook')
  ) {
    return 'email';
  }
  if (s.includes('facebook') || s.includes('instagram') || ['fb', 'ig', 'meta', 'an', 'msg'].includes(s)) {
    return 'meta';
  }
  if (s.includes('tiktok') || s === 'tt') return 'tiktok';
  // ChatGPT înainte de „openai": `chat.openai.com` conține ambele.
  if (s.includes('chatgpt') || s.includes('openai') || s === 'gpt') return 'chatgpt';
  if (s.includes('youtube') || s === 'yt') return 'youtube';
  if (s.includes('google') || s === 'gads' || s === 'adwords') return 'google';
  if (s.includes('bing') || s.includes('msn') || s === 'microsoft') return 'bing';
  if (s.includes('pinterest')) return 'pinterest';
  if (s.includes('snapchat') || s === 'snap') return 'snapchat';
  if (s.includes('linkedin')) return 'linkedin';
  if (s.includes('reddit')) return 'reddit';
  if (s === 'x' || s === 'x.com' || s.includes('twitter') || s === 't.co') return 'x';
  if (s.includes('whatsapp') || s === 'wa') return 'whatsapp';
  if (s.includes('telegram') || s === 'tg') return 'telegram';
  if (s.includes('perplexity') || s.includes('claude.ai') || s.includes('gemini.google')) return 'ai_assistant';
  if (s.includes('stripe')) return 'direct'; // redirect post-plată, nu o sursă reală
  if (s === 'sms' || s === 'viber') return 'sms';
  if (s === 'influencer' || s === 'creator') return 'influencer';
  if (s === 'partner' || s === 'affiliate') return 'affiliate';
  if (s === 'qr' || s === 'offline' || s === 'flyer') return 'offline';
  // Un hostname rămas neclasificat = trafic de referință.
  if (s.includes('.')) return 'referral';
  return s;
}

/** Aceeași mapare, ca fragment SQL — pentru agregările din `analytics.service`. */
export function normalizeChannelSql(raw: string): string {
  const s = `lower(trim(${raw}))`;
  return `CASE
    WHEN ${raw} IS NULL OR ${s} IN ('', 'direct', '(direct)', '(none)') THEN 'direct'
    WHEN ${s} IN ('email', 'e-mail', 'newsletter', 'com.google.android.gm', 'com.microsoft.office.outlook')
         OR ${s} LIKE 'mail.%' OR ${s} LIKE 'com.yahoo.mobile%' OR ${s} LIKE 'com.google.android.gm%'
         OR ${s} LIKE '%.mail.%' OR ${s} LIKE '%webmail%' OR ${s} LIKE '%mail.google%'
         OR ${s} LIKE '%mail.yahoo%' OR ${s} LIKE '%outlook%' THEN 'email'
    WHEN ${s} LIKE '%facebook%' OR ${s} LIKE '%instagram%' OR ${s} IN ('fb','ig','meta','an','msg') THEN 'meta'
    WHEN ${s} LIKE '%tiktok%' OR ${s} = 'tt' THEN 'tiktok'
    WHEN ${s} LIKE '%chatgpt%' OR ${s} LIKE '%openai%' OR ${s} = 'gpt' THEN 'chatgpt'
    WHEN ${s} LIKE '%youtube%' OR ${s} = 'yt' THEN 'youtube'
    WHEN ${s} LIKE '%google%' OR ${s} IN ('gads','adwords') THEN 'google'
    WHEN ${s} LIKE '%bing%' OR ${s} LIKE '%msn%' OR ${s} = 'microsoft' THEN 'bing'
    WHEN ${s} LIKE '%pinterest%' THEN 'pinterest'
    WHEN ${s} LIKE '%snapchat%' OR ${s} = 'snap' THEN 'snapchat'
    WHEN ${s} LIKE '%linkedin%' THEN 'linkedin'
    WHEN ${s} LIKE '%reddit%' THEN 'reddit'
    WHEN ${s} IN ('x','x.com','t.co') OR ${s} LIKE '%twitter%' THEN 'x'
    WHEN ${s} LIKE '%whatsapp%' OR ${s} = 'wa' THEN 'whatsapp'
    WHEN ${s} LIKE '%telegram%' OR ${s} = 'tg' THEN 'telegram'
    WHEN ${s} LIKE '%perplexity%' OR ${s} LIKE '%claude.ai%' OR ${s} LIKE '%gemini.google%' THEN 'ai_assistant'
    WHEN ${s} LIKE '%stripe%' THEN 'direct'
    WHEN ${s} IN ('sms','viber') THEN 'sms'
    WHEN ${s} IN ('influencer','creator') THEN 'influencer'
    WHEN ${s} IN ('partner','affiliate') THEN 'affiliate'
    WHEN ${s} IN ('qr','offline','flyer') THEN 'offline'
    WHEN ${s} LIKE '%.%' THEN 'referral'
    ELSE ${s}
  END`;
}

/** Eticheta umană a unui canal (pentru admin). */
export const CHANNEL_LABELS: Record<string, string> = {
  meta: 'Meta (FB + IG)',
  tiktok: 'TikTok',
  google: 'Google',
  chatgpt: 'ChatGPT',
  youtube: 'YouTube',
  bing: 'Bing',
  pinterest: 'Pinterest',
  snapchat: 'Snapchat',
  linkedin: 'LinkedIn',
  reddit: 'Reddit',
  x: 'X (Twitter)',
  email: 'Email',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  ai_assistant: 'Alți asistenți AI',
  sms: 'SMS',
  influencer: 'Influenceri',
  affiliate: 'Afiliați',
  offline: 'Offline / QR',
  referral: 'Referral',
  direct: 'Direct',
};

// ============================================================================
// 3. PARSAREA UNUI URL
// ============================================================================

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
  channel: string;
}

export function emptyUtmCapture(): UtmCapture {
  return {
    source: null, medium: null, campaign: null, content: null, term: null,
    utmId: null, sourcePlatform: null, creativeFormat: null, marketingTactic: null,
    adset: null, adsetId: null, ad: null, adId: null, placement: null,
    clickId: null, clickIdSource: null, clickIds: null, emailToken: null,
    channel: 'direct',
  };
}

/** Decodează un parametru UTM (`C3+%E2%80%94+OCAZII` → „C3 — OCAZII"). */
export function decodeParam(v: string | null | undefined, max = 256): string | null {
  if (v == null) return null;
  let d: string;
  try {
    d = decodeURIComponent(String(v).replace(/\+/g, ' '));
  } catch {
    d = String(v).replace(/\+/g, ' ');
  }
  d = d.trim();
  if (!d) return null;
  return d.length > max ? d.slice(0, max) : d;
}

/**
 * Macro netradus de platformă — `{{campaign.name}}` lipit ca text, `__CID__`,
 * `{campaignid}`. Nu e o valoare reală: mai bine null decât o „campanie" care
 * adună la un loc toate reclamele prost configurate.
 */
export function isMacroPlaceholder(v: string | null | undefined): boolean {
  if (!v) return true;
  const s = v.trim();
  if (!s) return true;
  if (/^\{\{[^}]*\}\}$/.test(s)) return true;   // Meta: {{campaign.name}}
  if (/^\{[a-z_]+\}$/i.test(s)) return true;    // Google: {campaignid}
  if (/^__[A-Z_]+__$/.test(s)) return true;     // TikTok: __CAMPAIGN_NAME__
  if (/^%[A-Z_]+%$/.test(s)) return true;       // alte platforme
  return false;
}

type ParamReader = (name: string) => string | null;

/** Parsează captura dintr-un reader de parametri (URLSearchParams sau obiect). */
export function parseUtmFromParams(get: ParamReader, referrer?: string | null): UtmCapture {
  const out = emptyUtmCapture();
  const val = (name: string, max = 256) => {
    const raw = decodeParam(get(name), max);
    return raw && !isMacroPlaceholder(raw) ? raw : null;
  };

  out.source = val('utm_source', 64);
  out.medium = val('utm_medium', 64);
  out.campaign = val('utm_campaign', 128);
  out.content = val('utm_content', 256);
  out.term = val('utm_term', 256);
  out.utmId = val('utm_id', 128);
  out.sourcePlatform = val('utm_source_platform', 64);
  out.creativeFormat = val('utm_creative_format', 64);
  out.marketingTactic = val('utm_marketing_tactic', 64);
  out.adset = val('utm_adset', 256);
  out.adsetId = val('utm_adset_id', 64);
  out.ad = val('utm_ad', 256);
  out.adId = val('utm_ad_id', 64);
  out.placement = val('utm_placement', 64);

  const ids: Record<string, string> = {};
  for (const { param, source } of CLICK_ID_PARAMS) {
    const raw = decodeParam(get(param), 512);
    if (!raw || isMacroPlaceholder(raw)) continue;
    ids[param] = raw;
    if (!out.clickId) {
      out.clickId = raw;
      out.clickIdSource = source;
    }
    if (param === EMAIL_CLICK_PARAM) out.emailToken = raw.slice(0, 64);
  }
  out.clickIds = Object.keys(ids).length ? ids : null;

  // Sursa se deduce în cascadă: UTM explicit → click-id → hostname din referrer.
  // Un `fbclid` fără `utm_source` e tot Meta; fără el am fi zis „direct".
  let sourceForChannel = out.source;
  if (!sourceForChannel && out.clickIdSource) sourceForChannel = out.clickIdSource;
  if (!sourceForChannel && referrer) {
    try {
      sourceForChannel = new URL(referrer).hostname || null;
    } catch {
      /* referrer invalid — rămâne null */
    }
  }
  out.channel = normalizeChannel(sourceForChannel);
  return out;
}

/** Parsează captura dintr-un URL complet. */
export function parseUtmFromUrl(url: string | null | undefined, referrer?: string | null): UtmCapture {
  if (!url) return emptyUtmCapture();
  try {
    const u = new URL(url);
    return parseUtmFromParams((n) => u.searchParams.get(n), referrer);
  } catch {
    return emptyUtmCapture();
  }
}

// ============================================================================
// 4. CONSTRUIREA UNUI LINK STANDARDIZAT
// ============================================================================

export interface UtmBuildInput {
  baseUrl: string;
  source: string;
  medium: string;
  campaign?: string | null;
  content?: string | null;
  term?: string | null;
  id?: string | null;
  adset?: string | null;
  adsetId?: string | null;
  ad?: string | null;
  adId?: string | null;
  placement?: string | null;
  sourcePlatform?: string | null;
  creativeFormat?: string | null;
  marketingTactic?: string | null;
  /** Parametri suplimentari (ex. `mc_eid`, `ui`, `promo`). */
  extra?: Record<string, string | null | undefined>;
}

const BUILD_MAP: Array<[keyof UtmBuildInput, string]> = [
  ['source', 'utm_source'],
  ['medium', 'utm_medium'],
  ['campaign', 'utm_campaign'],
  ['content', 'utm_content'],
  ['term', 'utm_term'],
  ['id', 'utm_id'],
  ['adset', 'utm_adset'],
  ['adsetId', 'utm_adset_id'],
  ['ad', 'utm_ad'],
  ['adId', 'utm_ad_id'],
  ['placement', 'utm_placement'],
  ['sourcePlatform', 'utm_source_platform'],
  ['creativeFormat', 'utm_creative_format'],
  ['marketingTactic', 'utm_marketing_tactic'],
];

/**
 * Construiește un URL cu setul standard de parametri.
 *
 * Parametrii deja prezenți în `baseUrl` NU se suprascriu — un link care vine
 * cu `?promo=X&utm_source=email` rămâne cu emailul lui; altfel un CTA construit
 * o dată și rescris a doua oară și-ar pierde atribuirea originală.
 */
export function buildUtmUrl(input: UtmBuildInput): string {
  let u: URL;
  try {
    u = new URL(input.baseUrl);
  } catch {
    return input.baseUrl;
  }
  const put = (key: string, value: string | null | undefined) => {
    const v = (value ?? '').toString().trim();
    if (!v) return;
    if (u.searchParams.has(key)) return;
    u.searchParams.set(key, v);
  };
  for (const [field, param] of BUILD_MAP) {
    put(param, input[field] as string | null | undefined);
  }
  for (const [k, v] of Object.entries(input.extra ?? {})) put(k, v);
  return u.toString();
}

/**
 * Slug pentru valorile UTM: minuscule, fără diacritice, cuvintele legate cu `-`.
 * Valorile scrise de om ajung altfel în rapoarte în trei variante („Cadou Mama",
 * „cadou mama", „cadou-mama") și se numără separat.
 */
export function utmSlug(v: string | null | undefined, max = 64): string {
  if (!v) return '';
  return String(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u021b\u0163]/gi, 't')
    .replace(/[\u0219\u015f\u017f]/gi, 's')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
}

// ============================================================================
// 5. ȘABLOANELE PER PLATFORMĂ (ce se copiază din admin)
// ============================================================================

export interface UtmTemplateField {
  param: string;
  value: string;
  note: string;
}

export interface UtmTemplate {
  id: string;
  platform: string;
  /** Unde se lipește, cuvânt cu cuvânt din interfața platformei. */
  where: string;
  /** Nivelul la care se setează (o dată pentru tot contul / per campanie). */
  scope: string;
  /** Șirul gata de lipit (fără `?` inițial — platformele îl adaugă singure). */
  suffix: string;
  fields: UtmTemplateField[];
  notes: string[];
  /** Avertismente care au costat deja date pierdute. */
  warnings: string[];
}

/**
 * Șabloanele, cu macro-urile REALE ale fiecărei platforme.
 *
 * Macro-urile sunt înlocuite de platformă la click. Dacă un macro nu e suportat
 * (sau e scris greșit), ajunge la noi ca text — de-aia `isMacroPlaceholder` îl
 * transformă în null în loc să-l numere ca valoare reală.
 */
export const UTM_TEMPLATES: UtmTemplate[] = [
  {
    id: 'meta',
    platform: 'Meta Ads (Facebook + Instagram)',
    where: 'Ads Manager → nivel Reclamă → Tracking → „URL parameters"',
    scope: 'Se setează o dată per reclamă; se copiază la duplicare. Poate fi pus și în șablonul de reclamă.',
    suffix:
      'utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_id={{campaign.id}}' +
      '&utm_adset={{adset.name}}&utm_adset_id={{adset.id}}&utm_content={{ad.name}}&utm_ad_id={{ad.id}}' +
      '&utm_placement={{placement}}&utm_source_platform={{site_source_name}}',
    fields: [
      { param: 'utm_source', value: 'meta', note: 'Fix. Placement-ul spune dacă a fost FB sau IG.' },
      { param: 'utm_medium', value: 'paid_social', note: 'Fix pentru feed/reels/stories.' },
      { param: 'utm_campaign', value: '{{campaign.name}}', note: 'Numele campaniei, citibil în rapoarte.' },
      { param: 'utm_id', value: '{{campaign.id}}', note: 'ID-ul numeric — cheia de legătură cu cheltuiala importată.' },
      { param: 'utm_adset', value: '{{adset.name}}', note: 'Grupul de anunțuri (audiența).' },
      { param: 'utm_adset_id', value: '{{adset.id}}', note: 'ID-ul grupului.' },
      { param: 'utm_content', value: '{{ad.name}}', note: 'Creativul — care video/imagine a vândut.' },
      { param: 'utm_ad_id', value: '{{ad.id}}', note: 'ID-ul reclamei.' },
      { param: 'utm_placement', value: '{{placement}}', note: 'feed, story, reels, marketplace…' },
      { param: 'utm_source_platform', value: '{{site_source_name}}', note: 'fb / ig / an / msg — platforma reală.' },
    ],
    notes: [
      '`fbclid` vine automat de la Meta; îl capturăm separat, deci atribuirea ține chiar dacă uiți parametrii.',
      'Numele de campanie / grup / reclamă din Ads Manager devin valori în rapoartele noastre — ține-le scurte și fără caractere ciudate.',
    ],
    warnings: [
      'NU lăsa niciun `{{…}}` scris de mână greșit: Meta îl trimite ca text și campania apare literal „{{campaign.name}}".',
      'Nu adăuga `?` la început — Ads Manager îl pune singur și ajungi cu `??`.',
    ],
  },
  {
    id: 'tiktok',
    platform: 'TikTok Ads',
    where: 'Ads Manager → nivel Ad → „Destination page" / URL → adaugă parametrii în URL',
    scope: 'Per reclamă. TikTok nu are câmp separat de „URL parameters" — se lipesc în URL după `?`.',
    suffix:
      'utm_source=tiktok&utm_medium=paid_social&utm_campaign=__CAMPAIGN_NAME__&utm_id=__CAMPAIGN_ID__' +
      '&utm_adset=__AID_NAME__&utm_adset_id=__AID__&utm_content=__CID_NAME__&utm_ad_id=__CID__' +
      '&utm_placement=__PLACEMENT__',
    fields: [
      { param: 'utm_source', value: 'tiktok', note: 'Fix.' },
      { param: 'utm_medium', value: 'paid_social', note: 'Fix.' },
      { param: 'utm_campaign', value: '__CAMPAIGN_NAME__', note: 'Numele campaniei.' },
      { param: 'utm_id', value: '__CAMPAIGN_ID__', note: 'ID-ul campaniei.' },
      { param: 'utm_adset', value: '__AID_NAME__', note: 'Ad group (grupul de anunțuri).' },
      { param: 'utm_adset_id', value: '__AID__', note: 'ID-ul ad group-ului.' },
      { param: 'utm_content', value: '__CID_NAME__', note: 'Numele reclamei / creativului.' },
      { param: 'utm_ad_id', value: '__CID__', note: 'ID-ul reclamei.' },
      { param: 'utm_placement', value: '__PLACEMENT__', note: 'Unde a rulat.' },
    ],
    notes: [
      '`ttclid` vine automat de la TikTok și îl capturăm separat, la fel ca `fbclid`.',
      'La TikTok macro-urile sunt cu underscore dublu la ambele capete — o singură liniuță lipsă și primești textul brut.',
    ],
    warnings: [
      'Dacă URL-ul are deja `?` (ex. `?ui=cadou`), leagă parametrii cu `&`, nu cu al doilea `?`.',
      'TikTok scurtează uneori URL-urile foarte lungi în previzualizare — verifică linkul final cu „Preview" înainte de publicare.',
    ],
  },
  {
    id: 'google',
    platform: 'Google Ads (Search / PMax / Display / YouTube)',
    where: 'Google Ads → Setări cont sau campanie → „Tracking" → „Final URL suffix"',
    scope: 'Se pune O SINGURĂ DATĂ la nivel de cont. Se aplică automat tuturor campaniilor.',
    suffix:
      'utm_source=google&utm_medium={ifsearch:cpc}{ifcontent:display}&utm_campaign={campaignid}' +
      '&utm_id={campaignid}&utm_adset_id={adgroupid}&utm_content={creative}&utm_term={keyword}' +
      '&utm_placement={placement}&utm_creative_format={devicemodel}',
    fields: [
      { param: 'utm_source', value: 'google', note: 'Fix.' },
      { param: 'utm_medium', value: '{ifsearch:cpc}{ifcontent:display}', note: 'Search → cpc, Display → display. Automat.' },
      { param: 'utm_campaign', value: '{campaignid}', note: 'Google NU expune numele campaniei — doar ID-ul.' },
      { param: 'utm_id', value: '{campaignid}', note: 'Același ID, pentru legătura cu cheltuiala.' },
      { param: 'utm_adset_id', value: '{adgroupid}', note: 'Ad group.' },
      { param: 'utm_content', value: '{creative}', note: 'ID-ul reclamei.' },
      { param: 'utm_term', value: '{keyword}', note: 'Cuvântul cheie care a declanșat afișarea.' },
      { param: 'utm_placement', value: '{placement}', note: 'Doar pe Display/YouTube; gol pe Search.' },
    ],
    notes: [
      '`gclid` (sau `gbraid` / `wbraid` pe iOS) vine automat — îl capturăm și pe el.',
      'Google trimite ID-uri, nu nume. În rapoarte campania apare ca număr până importăm numele din cheltuieli.',
      'Pentru YouTube Ads schimbă manual `utm_medium` în `paid_video` la nivel de campanie, dacă vrei să-l separi de Display.',
    ],
    warnings: [
      'Sufixul de la nivel de campanie ÎNLOCUIEȘTE complet pe cel de cont — nu se combină. Dacă îl pui pe campanie, copiază-l întreg.',
      '`{campaignname}` NU există ca macro. Nu-l inventa; rămâne text în raport.',
    ],
  },
  {
    id: 'chatgpt',
    platform: 'ChatGPT / OpenAI Ads',
    where:
      'Ads Manager → Campanii → „…" pe campanie → Editează campania → câmpul ' +
      '„Parametrii de interogare ai paginii de destinație". Același câmp există ' +
      'și pe Editează anunțul.',
    scope:
      'Se poate pune pe campanie (se aplică tuturor reclamelor din ea) SAU pe ' +
      'fiecare reclamă. Pune-l în AMBELE locuri, identic — vezi avertismentul.',
    suffix:
      'utm_source=chatgpt&utm_medium=paid_ai&utm_campaign=NUMELE-CAMPANIEI&utm_id={campaign_id}' +
      '&utm_adset_id={ad_group_id}&utm_ad_id={ad_id}&utm_content={ad_id}&utm_placement=chat',
    fields: [
      { param: 'utm_source', value: 'chatgpt', note: 'Fix — canalul apare separat în rapoarte.' },
      { param: 'utm_medium', value: 'paid_ai', note: 'Fix. Îl ține separat de social și de search.' },
      {
        param: 'utm_campaign',
        value: 'numele campaniei, scris de mână',
        note: 'OpenAI NU expune un macro de nume. Scrie-l identic cu numele din platformă.',
      },
      { param: 'utm_id', value: '{campaign_id}', note: 'Macro. Leagă rândul de cheltuiala din Insights.' },
      { param: 'utm_adset_id', value: '{ad_group_id}', note: 'Macro. Grupul de reclame.' },
      { param: 'utm_ad_id', value: '{ad_id}', note: 'Macro. Reclama individuală.' },
      { param: 'utm_content', value: '{ad_id}', note: 'Macro. Creativul, în lipsa unui macro de nume.' },
      { param: 'utm_placement', value: 'chat', note: 'Fix — singurul plasament de acum.' },
      {
        param: 'utm_ad',
        value: 'opțional, numele reclamei, scris de mână',
        note: 'Doar la nivel de reclamă. Face raportul lizibil: nume în loc de „ad_7f3…".',
      },
    ],
    notes: [
      'Macro-urile acceptate de platformă sunt EXACT acestea cinci: `{campaign_id}`, `{ad_group_id}`, `{ad_id}`, `{ad_account_id}`, `{oppref}`. Nu există macro de NUME (nici de campanie, nici de reclamă) — de-aia `utm_campaign` se scrie de mână.',
      '`{ad_account_id}` nu e în șablon: avem un singur cont de ads, deci ar fi o coloană cu aceeași valoare pe toate rândurile. `{oppref}` nici atât — vine deja singur pe URL.',
      'Traficul din ChatGPT fără UTM ajunge oricum pe canalul `chatgpt`: OpenAI pune `oppref` pe URL-ul de aterizare, iar noi îl citim ca identificator de click. Campania și creativul lipsesc însă — pe alea doar UTM-urile le pot spune.',
      'Cheltuiala se trage automat prin Advertiser API (Setări → Chei API), deci `utm_id={campaign_id}` e ceea ce leagă venitul de banii cheltuiți pe acea campanie.',
      'Conversiile se raportează prin pixelul de măsurare + Conversions API, separat de UTM-uri. UTM-urile de aici sunt pentru rapoartele NOASTRE; pixelul e pentru optimizarea campaniei.',
    ],
    warnings: [
      'Nu e documentat dacă valoarea de pe reclamă o ÎNLOCUIEȘTE pe cea de pe campanie sau se adaugă la ea. De-aia se pune identic în ambele locuri: dacă înlocuiește, rezultatul e același; dacă se adaugă, ies parametri dublați cu aceeași valoare, iar noi citim prima apariție. Oricum ai lua-o, iese corect.',
      'Un eveniment de conversie NU se poate atașa la o campanie decât din „Configurează" pe coloana Conversii — iar obiectivul campaniei (Clickuri / Conversii) NU se mai poate schimba după creare. Pentru optimizare pe conversii îți trebuie campanie nouă.',
      '`utm_campaign` fiind scris de mână, la DUPLICAREA unei campanii rămâne numele vechi. Schimbă-l imediat, altfel două campanii se adună pe același rând.',
      'Dacă duplici o reclamă, `{ad_id}` se schimbă singur — dar `utm_ad`, dacă l-ai pus, rămâne cel vechi.',
    ],
  },
  {
    id: 'email',
    platform: 'Emailuri (recuperare, campanii, retargetare)',
    where: 'Se aplică AUTOMAT de platformă. Nu ai ce lipi manual.',
    scope: 'Fiecare link din fiecare email trimis prin sistem.',
    suffix:
      'utm_source=email&utm_medium=email&utm_campaign=<campania>&utm_content=<butonul>&mc_eid=<token>',
    fields: [
      { param: 'utm_source', value: 'email', note: 'Fix.' },
      { param: 'utm_medium', value: 'email', note: 'Fix.' },
      { param: 'utm_campaign', value: 'ex. recovery-h24, camp-<id>, rule-<id>', note: 'Ce email a fost.' },
      { param: 'utm_content', value: 'ex. cta, logo, song, footer', note: 'Ce link din email a fost apăsat.' },
      { param: 'utm_term', value: 'ex. payers / nonpayers', note: 'Audiența, unde o știm.' },
      { param: 'mc_eid', value: 'token unic per (email, link, destinatar)', note: 'Leagă clicul de omul concret.' },
    ],
    notes: [
      'Linkurile sunt rescrise la trimitere prin `/api/e/c/<token>`, care numără clicul și redirecționează instant.',
      'Așa știm CINE a dat click, CÂND și de CÂTE ORI — plus dacă a cumpărat după.',
      'Linkul de dezabonare NU e urmărit, intenționat: nu vrem un hop în plus între om și butonul de „nu-mi mai trimite".',
    ],
    warnings: [
      'Magic link-urile de autentificare nu se rescriu niciodată — tokenul de login nu are ce căuta într-un tabel de clicuri.',
    ],
  },
  {
    id: 'organic',
    platform: 'Postări organice, influenceri, bio, QR',
    where: 'În linkul pe care îl lipești în postare / bio / material tipărit.',
    scope: 'Per postare. Un link per plasare.',
    suffix: 'utm_source=instagram&utm_medium=organic_social&utm_campaign=bio-link&utm_content=story-2026-09-01',
    fields: [
      { param: 'utm_source', value: 'instagram / tiktok / youtube / influencer', note: 'Unde stă linkul.' },
      { param: 'utm_medium', value: 'organic_social / influencer / offline', note: 'Nu „paid_social" — nu e reclamă.' },
      { param: 'utm_campaign', value: 'ex. bio-link, colab-<nume>', note: 'Ce inițiativă.' },
      { param: 'utm_content', value: 'ex. story-2026-09-01', note: 'Ce postare exact.' },
    ],
    notes: [
      'Un link în bio fără UTM se numără ca „direct" sau „referral" și nu poate fi comparat cu reclamele.',
      'Pentru QR-uri pe materiale tipărite folosește `utm_medium=offline` și pune anul în campanie.',
    ],
    warnings: [
      'Nu folosi `utm_medium=paid_social` pe postări organice — strică raportul de cost pe canal.',
    ],
  },
];

/** Convenția de nume pentru valorile scrise de mână. */
export const UTM_NAMING = {
  campaign: {
    pattern: '<tara>-<obiectiv>-<oferta>-<lunaan>',
    example: 'ro-conv-cadou-0926',
    rules: [
      '`tara` = codul de țară al site-ului: ro, bg, gr.',
      '`obiectiv` = conv (conversii), traf (trafic), remk (retargetare), lead.',
      '`oferta` = ce vindem în campania asta: cadou, nunta, botez, craciun.',
      '`lunaan` = luna și anul, patru cifre: 0926 = septembrie 2026.',
    ],
  },
  content: {
    pattern: '<format>-<unghi>-<varianta>',
    example: 'video-reactie-mama-v2',
    rules: [
      '`format` = video, imagine, carusel, text.',
      '`unghi` = ideea creativului: reactie, testimonial, pret, demo.',
      '`varianta` = v1, v2… la fiecare duplicare. Fără asta, două creative se adună.',
    ],
  },
  general: [
    'Doar litere mici, cifre și liniuță. Fără spații, fără diacritice, fără majuscule.',
    'Aceeași valoare, scrisă la fel de fiecare dată: `Cadou` și `cadou` sunt două rânduri diferite în raport.',
    'Nu pune date personale sau coduri promo în UTM — ajung în loguri și în bara de adrese.',
  ],
} as const;

/** Ce se poate întâmpla prost și cum se vede în rapoarte. */
export const UTM_PITFALLS: Array<{ symptom: string; cause: string; fix: string }> = [
  {
    symptom: 'Campania apare ca `{{campaign.name}}` sau `__CAMPAIGN_NAME__`.',
    cause: 'Macro-ul e scris greșit sau platforma nu îl suportă în locul unde l-ai pus.',
    fix: 'Copiază șablonul de aici, cuvânt cu cuvânt. Valorile de tip macro netradus sunt oricum ignorate la agregare.',
  },
  {
    symptom: 'Tot traficul plătit apare ca „direct".',
    cause: 'Lipsesc parametrii din reclamă, iar platforma nu trimite nici click-id (rar) sau linkul e scurtat printr-un serviciu care taie query string-ul.',
    fix: 'Nu folosi scurtatoare de linkuri pe reclame. Verifică linkul final cu previzualizarea platformei.',
  },
  {
    symptom: '„Google" adună și traficul din Gmail.',
    cause: 'Clientul de mail raportează `com.google.android.gm` ca referrer.',
    fix: 'Rezolvat în cod: emailul se separă înaintea Google în normalizarea canalului. Nu are nevoie de acțiune.',
  },
  {
    symptom: 'Aceeași campanie apare pe mai multe rânduri.',
    cause: 'Majuscule / spații / diacritice diferite între reclame.',
    fix: 'Folosește constructorul de linkuri din pagina asta — normalizează automat valorile.',
  },
  {
    symptom: 'Reclame duplicate care se adună într-un singur rând de creativ.',
    cause: '`utm_content` identic după duplicare.',
    fix: 'Adaugă sufix de variantă (`-v2`) la fiecare duplicare, sau folosește macro-ul de nume de reclamă.',
  },
  {
    symptom: 'Linkul are `??` sau `&&` și pagina se încarcă fără parametri.',
    cause: 'Ai lipit `?` la începutul sufixului, iar platforma îl adaugă și ea.',
    fix: 'Sufixul se lipește FĂRĂ `?` la început.',
  },
];

/** Spec-ul complet servit adminului (o singură sursă de adevăr, un singur GET). */
export function utmSpec() {
  return {
    version: 1,
    params: UTM_PARAMS,
    clickIds: CLICK_ID_PARAMS.filter((c) => c.param !== EMAIL_CLICK_PARAM),
    emailClickParam: EMAIL_CLICK_PARAM,
    sources: UTM_SOURCES,
    mediums: UTM_MEDIUMS,
    channelLabels: CHANNEL_LABELS,
    templates: UTM_TEMPLATES,
    naming: UTM_NAMING,
    pitfalls: UTM_PITFALLS,
  };
}
