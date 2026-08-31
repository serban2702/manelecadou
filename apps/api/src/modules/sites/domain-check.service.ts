import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { resolve4 } from 'dns/promises';
import { connect as tlsConnect, type PeerCertificate } from 'tls';
import { DataSource } from 'typeorm';
import { SitesService } from './sites.service';
import type { Site } from './site.entity';

/**
 * „Ce e făcut până acum pe domeniul X?" — răspuns dintr-o singură cerere.
 *
 * Verificările de infrastructură (DNS, certificat, HTTP) le face serverul, nu
 * browserul: din browser n-ai cum să afli issuer-ul unui certificat, iar un
 * `fetch` cross-origin spre un domeniu fără cert valid eșuează fără să-ți spună
 * de ce. Verificările de configurare se citesc din aceeași bază pe care o
 * folosește site-ul, deci arată realitatea, nu formularul nesalvat din admin.
 *
 * Funcționează și pentru un domeniu care nu e încă în platformă — atunci
 * răspunsul spune exact la ce pas din ghid ai rămas.
 */

export type DomainCheckStatus = 'ok' | 'missing' | 'partial' | 'info';

export interface DomainCheckItem {
  id: string;
  label: string;
  status: DomainCheckStatus;
  detail: string;
  /** Ecranul din admin care rezolvă lipsa (path SPA). */
  href?: string;
}

export interface DomainCheckHostResult {
  host: string;
  addresses: string[];
  pointsHere: boolean;
  error?: string;
}

export interface DomainCheckResult {
  domain: string;
  expectedIp: string | null;
  /** De unde știm IP-ul „corect": din domeniul principal, nu hardcodat. */
  expectedFrom: string;
  dns: { apex: DomainCheckHostResult; www: DomainCheckHostResult };
  tls: {
    ok: boolean;
    issuer: string | null;
    subject: string | null;
    validTo: string | null;
    isDefaultCert: boolean;
    error?: string;
  };
  http: { status: number | null; error?: string };
  site: {
    id: string;
    slug: string;
    name: string;
    locale: string;
    currency: string;
    active: boolean;
    sslEnabled: boolean;
    hiddenMode: boolean;
    maintenanceMode: boolean;
    isDefault: boolean;
    createdAt: string;
  } | null;
  checks: DomainCheckItem[];
}

/** Limbile cu fișier propriu în apps/web/messages/ (apps/web/i18n/locales.ts). */
const SHIPPED_LOCALES = ['ro', 'bg', 'sr', 'tr', 'el', 'hr', 'sl', 'bs'];

@Injectable()
export class DomainCheckService {
  private readonly logger = new Logger('DomainCheckService');

  constructor(
    private readonly sites: SitesService,
    private readonly config: ConfigService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async check(rawDomain: string): Promise<DomainCheckResult> {
    const domain = normalizeDomain(rawDomain);
    if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      throw new Error('Domeniu invalid. Scrie doar numele, ex. manele-nou.ro');
    }

    const reference = normalizeDomain(
      this.config.get<string>('DEFAULT_SITE_DOMAIN') || this.config.get<string>('APP_URL') || '',
    );
    const [expected, apex, www] = await Promise.all([
      reference ? lookup(reference) : Promise.resolve({ addresses: [] as string[] }),
      lookup(domain),
      lookup(`www.${domain}`),
    ]);
    const expectedIp = expected.addresses[0] ?? this.config.get<string>('SERVER_PUBLIC_IP') ?? null;

    const [tls, http] = await Promise.all([this.certificate(domain), this.head(domain)]);

    const site = await this.sites.findByDomain(domain);
    const checks = site ? await this.configChecks(site) : [];

    return {
      domain,
      expectedIp,
      expectedFrom: reference || 'SERVER_PUBLIC_IP',
      dns: {
        apex: { host: domain, ...apex, pointsHere: !!expectedIp && apex.addresses.includes(expectedIp) },
        www: { host: `www.${domain}`, ...www, pointsHere: !!expectedIp && www.addresses.includes(expectedIp) },
      },
      tls,
      http,
      site: site
        ? {
            id: site.id,
            slug: site.slug,
            name: site.name,
            locale: site.locale,
            currency: site.currency,
            active: site.active,
            sslEnabled: site.sslEnabled,
            hiddenMode: !!site.hiddenMode,
            maintenanceMode: !!site.maintenanceMode,
            isDefault: !!site.isDefault,
            createdAt: site.createdAt?.toISOString?.() ?? '',
          }
        : null,
      checks,
    };
  }

  /** Certificatul servit pentru `servername` — inclusiv cel implicit al lui Traefik. */
  private certificate(domain: string): Promise<DomainCheckResult['tls']> {
    return new Promise((resolve) => {
      const done = (r: DomainCheckResult['tls']) => resolve(r);
      let settled = false;
      const finish = (r: DomainCheckResult['tls']) => {
        if (settled) return;
        settled = true;
        done(r);
      };
      try {
        // rejectUnauthorized: false — vrem să CITIM certificatul chiar dacă e
        // invalid; „TRAEFIK DEFAULT CERT" e exact cazul pe care îl căutăm.
        const socket = tlsConnect(
          { host: domain, port: 443, servername: domain, rejectUnauthorized: false, timeout: 6000 },
          () => {
            const cert = socket.getPeerCertificate() as PeerCertificate | null;
            const subject = one(cert?.subject?.CN);
            const issuer = one(cert?.issuer?.CN) || one(cert?.issuer?.O);
            const isDefaultCert = !!subject && /traefik default cert/i.test(subject);
            finish({
              ok: socket.authorized && !isDefaultCert,
              issuer,
              subject,
              validTo: cert?.valid_to ?? null,
              isDefaultCert,
              error: socket.authorized ? undefined : socket.authorizationError?.toString(),
            });
            socket.end();
          },
        );
        socket.on('timeout', () => {
          socket.destroy();
          finish({ ok: false, issuer: null, subject: null, validTo: null, isDefaultCert: false, error: 'timeout' });
        });
        socket.on('error', (err) => {
          finish({
            ok: false,
            issuer: null,
            subject: null,
            validTo: null,
            isDefaultCert: false,
            error: (err as Error).message,
          });
        });
      } catch (err) {
        finish({
          ok: false,
          issuer: null,
          subject: null,
          validTo: null,
          isDefaultCert: false,
          error: (err as Error).message,
        });
      }
    });
  }

  private async head(domain: string): Promise<DomainCheckResult['http']> {
    try {
      const res = await fetch(`https://${domain}/`, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'manelecadou-domain-check/1.0' },
      });
      return { status: res.status };
    } catch (err) {
      return { status: null, error: (err as Error).message };
    }
  }

  /** Ce e configurat pe site — citit din baza de date, nu din formular. */
  private async configChecks(site: Site): Promise<DomainCheckItem[]> {
    const out: DomainCheckItem[] = [];
    const push = (i: DomainCheckItem) => out.push(i);

    // — vizibilitate
    const visible = site.active && !site.hiddenMode && !site.maintenanceMode;
    push({
      id: 'visible',
      label: 'Vizibil pentru clienți',
      status: visible ? 'ok' : 'missing',
      detail: !site.active
        ? 'Site inactiv'
        : site.hiddenMode
          ? 'Ascuns — răspunde 444'
          : site.maintenanceMode
            ? 'În mentenanță'
            : 'Live',
      href: '/site/operations',
    });
    push({
      id: 'ssl',
      label: 'HTTPS pornit',
      status: site.sslEnabled ? 'ok' : 'missing',
      detail: site.sslEnabled ? 'sslEnabled' : 'sslEnabled = false',
      href: '/site/operations',
    });

    // — limbă
    const localeShipped = SHIPPED_LOCALES.includes(site.locale);
    push({
      id: 'locale',
      label: 'Traduceri pentru limbă',
      status: localeShipped ? 'ok' : 'missing',
      detail: localeShipped
        ? `${site.locale} — livrată`
        : `${site.locale} nu are fișier de traducere; textele cad pe română (cere cod + deploy)`,
      href: '/site/identity',
    });

    // — brand
    push({
      id: 'logo',
      label: 'Logo încărcat',
      status: site.brand?.logoUrl ? 'ok' : 'missing',
      detail: site.brand?.logoUrl ? 'setat' : 'lipsește',
      href: '/site/appearance',
    });
    const seo = site.seo ?? {};
    push({
      id: 'seo',
      label: 'Titlu și descriere SEO',
      status: seo.title && seo.description ? 'ok' : seo.title || seo.description ? 'partial' : 'missing',
      detail: seo.title ? (seo.description ? 'complet' : 'lipsește descrierea') : 'lipsesc',
      href: '/site/appearance',
    });

    // — email
    const fromEmail = (site.fromEmail || site.mailConfig?.fromEmail || '').trim();
    const provider = site.mailConfig?.provider;
    const smtpHost = site.mailConfig?.smtp?.host || '';
    // PowerMail nu are credențiale per-site (o singură cheie globală, cu câte o
    // identitate verificată per domeniu), deci „ales explicit" e suficient.
    const transport = provider === 'powermail' ? 'PowerMail' : provider === 'smtp' ? smtpHost : '';
    push({
      id: 'email',
      label: 'Expeditor de email',
      status: fromEmail ? (transport ? 'ok' : 'partial') : 'missing',
      detail: fromEmail
        ? transport
          ? `${fromEmail} prin ${transport}`
          : `${fromEmail}, pe transportul global (nimic ales pentru site)`
        : 'lipsește',
      href: '/site/operations',
    });

    // — catalog și prompturi (pe motorul activ al tenantului)
    const engine = site.musicEngine === 'google' ? 'google' : 'suno';
    const key = engine === 'google' ? 'googlePrompt' : 'sunoPrompt';
    const styles = site.styles ?? [];
    const occasions = site.occasions ?? [];
    const voices = site.voices ?? [];
    const missingStyles = styles.filter((s) => !String((s as never)[key] ?? '').trim());
    const missingOccasions = occasions.filter((o) => !String((o as never)[key] ?? '').trim());
    push({
      id: 'styles',
      label: `Prompturi ${engine === 'google' ? 'Google' : 'Suno'} pe stiluri`,
      status: styles.length === 0 ? 'missing' : missingStyles.length ? 'partial' : 'ok',
      detail:
        styles.length === 0
          ? 'niciun stil'
          : missingStyles.length
            ? `${missingStyles.length} din ${styles.length} fără prompt: ${missingStyles.slice(0, 4).map((s) => s.nm || s.id).join(', ')}`
            : `${styles.length} stiluri, toate cu prompt`,
      href: '/site/catalog/styles',
    });
    push({
      id: 'occasions',
      label: `Prompturi ${engine === 'google' ? 'Google' : 'Suno'} pe ocazii`,
      status: occasions.length === 0 ? 'missing' : missingOccasions.length ? 'partial' : 'ok',
      detail:
        occasions.length === 0
          ? 'nicio ocazie'
          : missingOccasions.length
            ? `${missingOccasions.length} din ${occasions.length} fără prompt: ${missingOccasions.slice(0, 4).map((o) => o.nm || o.id).join(', ')}`
            : `${occasions.length} ocazii, toate cu prompt`,
      href: '/site/catalog/occasions',
    });
    push({
      id: 'voices',
      label: 'Voci',
      status: voices.length ? 'ok' : 'missing',
      detail: voices.length ? `${voices.length} voci` : 'niciuna',
      href: '/site/catalog/voices',
    });

    // — interfețe și pachete (aici stă prețul real)
    const items = site.experienceConfig?.items ?? {};
    const enabled = Object.entries(items).filter(([, v]) => v?.enabled !== false);
    const withPackages = enabled.filter(([, v]) => v?.packages && Object.keys(v.packages).length > 0);
    push({
      id: 'interfaces',
      label: 'Interfețe active',
      status: enabled.length ? 'ok' : 'info',
      detail: enabled.length
        ? `${enabled.map(([k]) => k).join(', ')} · implicită: ${site.experienceConfig?.defaultSlug ?? 'classic'}`
        : 'doar classic (implicit)',
      href: '/site/interfaces',
    });
    const legacyPrices = site.packagePricesCents && Object.keys(site.packagePricesCents).length > 0;
    push({
      id: 'packages',
      label: 'Prețuri pachete',
      status: withPackages.length ? 'ok' : legacyPrices ? 'partial' : 'missing',
      detail: withPackages.length
        ? `setate pe ${withPackages.map(([k]) => k).join(', ')}`
        : legacyPrices
          ? 'doar la nivel de tenant — pe interfață nu e nimic, deci se folosesc astea'
          : 'nicăieri; se folosesc default-urile din cod, gândite în lei',
      href: '/site/interfaces',
    });

    // — conținut
    const [demos, seoPages] = await Promise.all([
      this.count('site_demos', site.id, 'active'),
      this.count('seo_pages', site.id, 'published'),
    ]);
    push({
      id: 'demos',
      label: 'Demo-uri',
      status: demos >= 5 ? 'ok' : demos > 0 ? 'partial' : 'missing',
      detail: demos ? `${demos} active` : 'niciunul — pagina /asculta e goală',
      href: '/site-demos',
    });
    push({
      id: 'seo-pages',
      label: 'Articole SEO',
      status: seoPages >= 20 ? 'ok' : seoPages > 0 ? 'partial' : 'missing',
      detail: seoPages ? `${seoPages} publicate` : 'niciunul',
      href: '/seo-pages',
    });

    // — firmă și măsurare
    const legalName = site.companyInfo?.legalName?.trim();
    push({
      id: 'company',
      label: 'Date firmă',
      status: legalName ? 'ok' : 'missing',
      detail: legalName || 'lipsesc (apar pe factură și în termeni)',
      href: '/site/operations',
    });
    const analytics = site.analytics ?? {};
    const pixels = [
      analytics.ga4Id ? 'GA4' : '',
      analytics.metaPixelId ? 'Meta' : '',
      analytics.tiktokPixelId ? 'TikTok' : '',
    ].filter(Boolean);
    push({
      id: 'pixels',
      label: 'Pixeli',
      status: pixels.length ? 'ok' : 'missing',
      detail: pixels.length ? pixels.join(', ') : 'niciunul — campaniile nu se pot măsura',
      href: '/site/operations',
    });

    return out;
  }

  /** Numărătoare simplă, ca să nu importăm module doar pentru un COUNT. */
  private async count(table: string, siteId: string, flagColumn?: string): Promise<number> {
    try {
      const where = flagColumn ? `AND "${flagColumn}" = true` : '';
      const rows = await this.ds.query(
        `SELECT count(*)::int AS n FROM "${table}" WHERE "siteId" = $1 ${where}`,
        [siteId],
      );
      return Number(rows?.[0]?.n ?? 0);
    } catch (err) {
      this.logger.warn(`count ${table} failed: ${(err as Error).message}`);
      return 0;
    }
  }
}

/** `subject.CN` poate veni și ca listă când certificatul are mai multe valori. */
function one(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function normalizeDomain(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^www\./, '');
}

async function lookup(host: string): Promise<{ addresses: string[]; error?: string }> {
  try {
    return { addresses: await resolve4(host) };
  } catch (err) {
    return { addresses: [], error: (err as { code?: string }).code ?? (err as Error).message };
  }
}
