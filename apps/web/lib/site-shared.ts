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
  /**
   * Mostre audio (URL public) per stil/voce — folosite de butoanele ► din /studio.
   * Cheia = id-ul stilului ('clasic', 'modern', ...) sau al vocii ('adi', 'florinel', ...).
   */
  styleSamples?: Record<string, SiteSampleEntry>;
  voiceSamples?: Record<string, SiteSampleEntry>;
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
