/**
 * Convertește un `Site` în obiectul `EmailBranding` consumat de template-uri.
 * Folosit de toate call-site-urile care trimit email-uri (auth, generations,
 * payments, generations) ca să propage logo/contact/firma per tenant.
 *
 * Pentru un câmp gol pe site, templates.ts cade pe defaults Manele Cadou —
 * deci nu trebuie să completezi toate câmpurile pentru un site nou, doar pe
 * cele unde brandul diferă.
 */

import type { EmailBranding } from './templates/templates';
import type { Site } from '../modules/sites/site.entity';

function joinNonEmpty(parts: Array<string | null | undefined>, sep = ' · '): string {
  return parts.map((p) => (p ?? '').trim()).filter(Boolean).join(sep);
}

function siteAbsoluteUrl(domain: string | null | undefined): string | undefined {
  if (!domain) return undefined;
  if (/^https?:\/\//i.test(domain)) return domain.replace(/\/+$/, '');
  // localhost / .local rămân pe http
  if (domain.startsWith('localhost') || domain.startsWith('127.') || domain.endsWith('.local')) {
    return `http://${domain}`;
  }
  return `https://${domain}`;
}

function absoluteAsset(siteUrl: string | undefined, assetUrl: string | null | undefined): string | undefined {
  if (!assetUrl) return undefined;
  const trimmed = assetUrl.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:')) return trimmed;
  if (!siteUrl) return undefined;
  return `${siteUrl}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

/**
 * Construiește branding-ul pentru un email outbound al unui site.
 * Returnează `undefined` dacă `site` lipsește — caller-ul pasează atunci direct
 * `undefined` la template, care folosește defaults globale.
 */
export function brandingFromSite(site: Site | null | undefined): EmailBranding | undefined {
  if (!site) return undefined;
  const siteUrl = siteAbsoluteUrl(site.domain);

  // Bannerul email: preferință explicită → logo → undefined (template-ul cade pe default).
  const bannerCandidate =
    site.brand?.emailBannerUrl ?? site.brand?.logoUrl ?? null;
  const bannerUrl = absoluteAsset(siteUrl, bannerCandidate);

  // Company line: construim din `companyInfo` dacă e completat, altfel lăsăm
  // undefined → template cade pe `dict(locale).footer.company` (fallback brand).
  const ci = site.companyInfo ?? {};
  const year = new Date().getFullYear();
  const companyLine = ci.legalName
    ? joinNonEmpty([
        `© ${year} ${ci.legalName}`,
        ci.cui ? `CUI ${ci.cui}` : null,
        ci.regCom ?? null,
      ])
    : undefined;

  return {
    name: site.name || undefined,
    siteUrl,
    bannerUrl,
    contactEmail: site.supportEmail || site.fromEmail || undefined,
    contactPhone: site.social?.phone || undefined,
    companyLine,
  };
}
