/**
 * Tipuri și helpers pure pentru site config — safe atât în server cât și în client
 * components. Nu importă `next/headers` (care e server-only). Pentru fetch-ul
 * efectiv al configului în server components, vezi `site-config.ts`.
 */

export interface SiteConfig {
  id: string;
  slug: string;
  domain: string;
  name: string;
  locale: string;
  currency: string;
  basePriceCents: number;
  giftPriceCents: number;
  brand: {
    primaryColor?: string;
    accentColor?: string;
    logoUrl?: string;
    ogImageUrl?: string;
    tagline?: string;
    faviconUrl?: string;
  };
  seo: { title?: string; description?: string; keywords?: string };
  analytics: { ga4Id?: string; metaPixelId?: string; tiktokPixelId?: string };
  social?: {
    instagram?: string;
    facebook?: string;
    tiktok?: string;
    youtube?: string;
    whatsapp?: string;
    phone?: string;
  };
  companyInfo?: {
    legalName?: string;
    cui?: string;
    regCom?: string;
    address?: string;
    iban?: string;
    ownerName?: string;
  };
  supportEmail?: string | null;
  active: boolean;
  maintenanceMode: boolean;
  hiddenMode?: boolean;
  maintenanceMessage?: Record<string, string>;
  /** Lista IP-uri scutite de maintenance + hidden mode (exact match sau wildcard "*"). */
  ipWhitelist?: string[];
  /** IP-ul detectat al request-ului curent (setat de API la /public/site). */
  clientIp?: string | null;
  /** Dacă false, fluxul cere plată ÎNAINTE de generare (skip demo gratuit 30s). */
  demoEnabled?: boolean;
  /** Configurație stiluri/voci/ocazii per site. Dacă goale, fallback la seed-data. */
  styles?: SiteStyleEntry[];
  voices?: SiteVoiceEntry[];
  occasions?: SiteOccasionEntry[];
  /**
   * Mostre audio (URL public) per stil/voce — folosite de butoanele ► din /studio.
   * Cheia = id-ul stilului ('clasic', 'modern', ...) sau al vocii ('adi', 'florinel', ...).
   */
  styleSamples?: Record<string, SiteSampleEntry>;
  voiceSamples?: Record<string, SiteSampleEntry>;
}

export interface SiteStyleEntry {
  id: string;
  em: string;
  nm: string;
  ds: string;
  heat?: string;
  i18n?: Record<string, { nm?: string; ds?: string; heat?: string }>;
  sunoPrompt?: string;
}

export interface SiteVoiceEntry {
  id: string;
  nm: string;
  tg: string;
  av: string;
  i18n?: Record<string, { nm?: string; tg?: string }>;
  sunoVoice?: string;
}

export interface SiteOccasionEntry {
  id: string;
  em: string;
  nm: string;
  i18n?: Record<string, { nm?: string }>;
}

/**
 * Verifică dacă un IP e în lista whitelist. Suportă exact-match și prefix
 * wildcard simplu ("192.168.*" matches "192.168.1.5"). Returnează `false`
 * pentru valori nule sau listă goală.
 */
export function isIpWhitelisted(clientIp: string | null | undefined, whitelist: string[] | undefined): boolean {
  if (!clientIp || !whitelist || whitelist.length === 0) return false;
  const ip = clientIp.trim();
  for (const raw of whitelist) {
    const entry = (raw ?? '').trim();
    if (!entry) continue;
    if (entry === ip) return true;
    if (entry.endsWith('*')) {
      const prefix = entry.slice(0, -1);
      if (ip.startsWith(prefix)) return true;
    }
  }
  return false;
}

export interface SiteSampleEntry {
  audioUrl: string;
  generatedAt: string;
  sunoTaskId?: string;
}

/** Formatează un preț în valuta site-ului folosind locale-ul lui. */
export function formatPrice(
  site: Pick<SiteConfig, 'locale' | 'currency'>,
  cents: number,
  opts: { fractionDigits?: number } = {},
): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(site.locale, {
      style: 'currency',
      currency: site.currency,
      minimumFractionDigits: opts.fractionDigits ?? 2,
      maximumFractionDigits: opts.fractionDigits ?? 2,
    }).format(value);
  } catch {
    return `${value.toFixed(opts.fractionDigits ?? 2)} ${site.currency}`;
  }
}

/** URL-ul absolut al site-ului curent (https://<domain>), fallback localhost. */
export function siteUrl(site: Pick<SiteConfig, 'domain'>): string {
  if (!site.domain || site.domain.startsWith('localhost') || site.domain.startsWith('127.')) {
    return `http://${site.domain || 'localhost:1500'}`;
  }
  // Domeniile *.local (testare locală) folosesc HTTP fără port
  if (site.domain.endsWith('.local')) {
    return `http://${site.domain}:1500`;
  }
  return `https://${site.domain}`;
}

/** Email-ul de contact afișat în UI. Fallback la salut@<domain> dacă nu e setat. */
export function siteSupportEmail(site: Pick<SiteConfig, 'domain' | 'supportEmail'>): string {
  return site.supportEmail || `salut@${site.domain}`;
}
