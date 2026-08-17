/**
 * Logica CENTRALIZATĂ de normalizare a sursei de trafic + regula de atribuire.
 *
 * De ce există fișierul: sursa unei sesiuni e stocată RAW în
 * `analytics_sessions.source` — fie `utm_source`, fie hostname-ul din referrer.
 * Multe „surse" nu sunt de fapt canale de achiziție:
 *   - `com.google.android.gm` / `mail.google.com` = aplicația/webul Gmail →
 *     traficul din PROPRIILE noastre emailuri (magic link login, livrare melodie),
 *     NU Google Ads/organic. Clasificarea naivă „conține google → Google" îl băga
 *     greșit la Google (2026-07: ~64% din „Google" era de fapt Gmail).
 *   - `checkout.stripe.com` = redirect post-plată, nu o sursă reală.
 *
 * Aici mapăm sursa raw la CANALE canonice și definim regula de atribuire de venit
 * „Meta-first pe 7 zile": dacă un client a avut un touch Meta în ultimele 7 zile
 * înainte de plată, plata se atribuie Meta indiferent de ultimul touch (email,
 * google branded, direct). Meta e canalul de achiziție plătit; restul sunt de
 * regulă retenție (email) sau reveniri branded.
 *
 * Toate funcțiile întorc fragmente SQL (string). `raw` e o expresie SQL care se
 * evaluează la sursa brută (ex. `s.source`, `a.source`).
 */

/**
 * CASE care mapează sursa brută la un canal canonic:
 * `direct | email | facebook | instagram | tiktok | google | youtube | whatsapp
 *  | telegram | <raw lowercase>`.
 *
 * ORDINEA CONTEAZĂ: `email` și `direct` sunt verificate ÎNAINTE de `google`,
 * fiindcă `com.google.android.gm` și `mail.google.com` conțin „google" dar sunt
 * email, nu Google search/ads.
 */
export function normalizeSourceSql(raw: string): string {
  const s = `lower(${raw})`;
  return `CASE
    WHEN ${raw} IS NULL OR ${s} IN ('', 'direct', '(direct)') THEN 'direct'
    WHEN ${s} = 'com.google.android.gm'
         OR ${s} LIKE 'mail.%' OR ${s} LIKE '%.mail.%' OR ${s} LIKE '%webmail%'
         OR ${s} LIKE '%mail.google%' OR ${s} LIKE '%mail.yahoo%'
         OR ${s} LIKE '%outlook%' OR ${s} = 'com.microsoft.office.outlook'
         OR ${s} LIKE 'com.yahoo.mobile%' OR ${s} LIKE 'com.google.android.gm%'
         OR ${s} IN ('email', 'newsletter', 'e-mail') THEN 'email'
    WHEN ${s} LIKE '%facebook%' OR ${s} IN ('fb', 'meta', 'an') THEN 'facebook'
    WHEN ${s} LIKE '%instagram%' OR ${s} = 'ig' THEN 'instagram'
    WHEN ${s} LIKE '%tiktok%' THEN 'tiktok'
    WHEN ${s} LIKE '%google%' THEN 'google'
    WHEN ${s} LIKE '%youtube%' OR ${s} = 'yt' THEN 'youtube'
    WHEN ${s} LIKE '%whatsapp%' OR ${s} = 'wa' THEN 'whatsapp'
    WHEN ${s} LIKE '%telegram%' THEN 'telegram'
    ELSE ${s}
  END`;
}

/** Predicat SQL: sesiunea e un touch Meta (Facebook / Instagram, orice variantă). */
export function isMetaSourceSql(raw: string): string {
  const s = `lower(${raw})`;
  return `(${s} LIKE '%facebook%' OR ${s} IN ('fb', 'meta', 'an') OR ${s} LIKE '%instagram%' OR ${s} = 'ig')`;
}

/** Predicat SQL: sesiunea e „direct" (fără sursă reală de campanie). */
export function isDirectSourceSql(raw: string): string {
  const s = `lower(${raw})`;
  return `(${raw} IS NULL OR ${s} IN ('', 'direct', '(direct)'))`;
}

/**
 * Fragment ORDER BY canonic pentru „ce canal a adus banii", în ordinea:
 *   1. Meta câștigă dacă are un touch în ultimele 7 zile înainte de plată
 *      (regula cerută: client venit din Meta în 7 zile = atribuit Meta).
 *   2. Altfel, ultima sursă non-direct (last non-direct touch).
 *   3. Cea mai recentă sesiune.
 *
 * @param sourceCol         expresie SQL pentru sursa sesiunii (ex. `s.source`)
 * @param startedAtCol      expresie SQL pentru startedAt-ul sesiunii
 * @param paymentCreatedCol expresie SQL pentru createdAt-ul plății
 */
export function attributionOrderBySql(
  sourceCol: string,
  startedAtCol: string,
  paymentCreatedCol: string,
): string {
  return `(CASE WHEN ${isMetaSourceSql(sourceCol)} AND ${startedAtCol} >= ${paymentCreatedCol} - INTERVAL '7 days' THEN 0 ELSE 1 END) ASC,
           (CASE WHEN ${isDirectSourceSql(sourceCol)} THEN 1 ELSE 0 END) ASC,
           ${startedAtCol} DESC`;
}

/** Decodare utm_campaign / utm_content (C3+%E2%80%94+OCAZII → „C3 — OCAZII"). */
export function decodeUtmParam(v: string | null | undefined): string | null {
  if (!v) return null;
  try {
    const d = decodeURIComponent(String(v).replace(/\+/g, ' ')).trim();
    return d || null;
  } catch {
    const d = String(v).replace(/\+/g, ' ').trim();
    return d || null;
  }
}

/** Template Ads Manager netradus — nu e o campanie reală. */
export function isPlaceholderCampaign(v: string | null | undefined): boolean {
  if (!v) return true;
  const s = v.trim();
  if (!s) return true;
  if (/^__CAMPAIGN_(NAME|ID)__$/i.test(s)) return true;
  if (/^\{\{[^}]+\}\}$/.test(s)) return true;
  if (/^__AD_(NAME|ID)__$/i.test(s)) return true;
  return false;
}

/**
 * Aceeași mapare ca `normalizeSourceSql`, în JS — pentru snapshot-ul persistat
 * pe plată (valorile din DB sunt canonic: facebook / email / direct / …).
 */
export function normalizeSource(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = raw.toLowerCase().trim();
  if (!s || s === 'direct' || s === '(direct)') return 'direct';
  if (
    s === 'com.google.android.gm' ||
    s.startsWith('mail.') ||
    s.includes('.mail.') ||
    s.includes('webmail') ||
    s.includes('mail.google') ||
    s.includes('mail.yahoo') ||
    s.includes('outlook') ||
    s === 'com.microsoft.office.outlook' ||
    s.startsWith('com.yahoo.mobile') ||
    s.startsWith('com.google.android.gm') ||
    s === 'email' ||
    s === 'newsletter' ||
    s === 'e-mail'
  ) {
    return 'email';
  }
  if (s.includes('facebook') || s === 'fb' || s === 'meta' || s === 'an') return 'facebook';
  if (s.includes('instagram') || s === 'ig') return 'instagram';
  if (s.includes('tiktok')) return 'tiktok';
  if (s.includes('google')) return 'google';
  if (s.includes('youtube') || s === 'yt') return 'youtube';
  if (s.includes('whatsapp') || s === 'wa') return 'whatsapp';
  if (s.includes('telegram')) return 'telegram';
  return s;
}

export function utmFromUrl(url: string | null | undefined): {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
} {
  const empty = { source: null, medium: null, campaign: null, content: null };
  if (!url) return empty;
  try {
    const u = new URL(url);
    return {
      source: decodeUtmParam(u.searchParams.get('utm_source')),
      medium: decodeUtmParam(u.searchParams.get('utm_medium')),
      campaign: decodeUtmParam(u.searchParams.get('utm_campaign')),
      content: decodeUtmParam(u.searchParams.get('utm_content')),
    };
  } catch {
    return empty;
  }
}
