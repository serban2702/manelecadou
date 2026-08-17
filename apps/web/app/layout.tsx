import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Cinzel, Manrope } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { Providers } from '@/lib/providers';
import { CursorHint } from '@/components/CursorHint';
import { Analytics } from '@/components/Analytics';
import { Tracker } from '@/components/Tracker';
import { CookieConsent } from '@/components/CookieConsent';
import { ConfirmDialogProvider } from '@/components/ConfirmDialog';
import { Toaster } from '@/components/Toaster';
import { ClientErrorReporter } from '@/components/ClientErrorReporter';
import { OpenReplay } from '@/components/OpenReplay';
import { MaintenancePage } from '@/components/MaintenancePage';
import { LOCALE_META, isLocale } from '@/i18n/locales';
import { getSiteConfig, siteSupportEmail, siteUrl as siteUrlOf } from '@/lib/site-config';
import { isIpWhitelisted } from '@/lib/site-shared';
import { SiteProvider } from '@/lib/site-context';
import { ExperienceProvider } from '@/lib/experience-context';
import { resolveExperienceSlug } from '@/experiences/assign';
import './globals.css';

const cinzel = Cinzel({ subsets: ['latin'], weight: ['700', '900'], variable: '--font-cinzel', display: 'swap' });
const manrope = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-manrope', display: 'swap' });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:1500';

/** Extrage IP-ul clientului din headers pentru a-l compara cu site.ipWhitelist. */
async function isClientIpWhitelisted(whitelist: string[] | undefined): Promise<boolean> {
  if (!whitelist?.length) return false;
  const h = await headers();
  const xff = h.get('x-forwarded-for');
  const real = h.get('x-real-ip');
  const ip = (xff?.split(',')[0]?.trim()) || real?.trim() || null;
  return isIpWhitelisted(ip, whitelist);
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  const site = await getSiteConfig();
  const baseUrl = site.id === 'fallback' ? APP_URL : siteUrlOf(site);
  const title = site.seo.title || site.name || t('title');
  const description = site.seo.description || t('description');
  const ogImage = site.brand.ogImageUrl || `${baseUrl}/icon-512.png`;
  const company = site.companyInfo ?? {};
  return {
    title: {
      default: title,
      template: `%s · ${site.name}`,
    },
    description,
    themeColor: site.brand.primaryColor || '#0a0606',
    metadataBase: new URL(baseUrl),
    keywords: site.seo.keywords
      ? site.seo.keywords.split(',').map((k) => k.trim()).filter(Boolean)
      : [
          'manele cadou', 'manele AI', 'generator manele', 'manele personalizate',
          'manea pentru', 'studio manele', 'tallava', 'kuchek', 'trapanele',
        ],
    authors: [{ name: company.legalName || site.name }],
    openGraph: {
      type: 'website',
      siteName: site.name,
      title: title,
      description: description,
      url: baseUrl,
      // Locale OG (ex. bg_BG, tr_TR) — Facebook/LinkedIn folosesc asta pentru
      // a arăta corect previewul în limba țării. Fără hreflang cross-site
      // (site-urile sunt entități SEO complet izolate, per cerință).
      locale: isLocale(site.locale) ? LOCALE_META[site.locale].og : 'ro_RO',
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    alternates: {
      canonical: baseUrl,
    },
    twitter: {
      card: 'summary_large_image',
      title: site.name,
      description: description,
      images: [ogImage],
    },
    icons: {
      icon: [
        { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
        { url: '/favicon-16.png', type: 'image/png', sizes: '16x16' },
        { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
        { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
      ],
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
      shortcut: '/favicon-32.png',
    },
    manifest: '/site.webmanifest',
  };
}

/** Construit dinamic per-site din getSiteConfig(). Vezi RootLayout. */
function buildOrgJsonLd(site: Awaited<ReturnType<typeof getSiteConfig>>, baseUrl: string) {
  const company = site.companyInfo ?? {};
  const social = site.social ?? {};
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.name,
    legalName: company.legalName || site.name,
    url: baseUrl,
    logo: site.brand.logoUrl || `${baseUrl}/icon-512.png`,
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: social.phone || undefined,
      contactType: 'customer service',
      email: siteSupportEmail(site),
      availableLanguage: ['Romanian', 'Bulgarian', 'Serbian', 'Turkish', 'Greek', 'Croatian', 'Slovenian', 'Bosnian'],
    },
    sameAs: [social.instagram, social.facebook, social.tiktok, social.youtube].filter(Boolean),
  };
}

function buildWebsiteJsonLd(site: Awaited<ReturnType<typeof getSiteConfig>>, baseUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    url: baseUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${baseUrl}/asculta?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = await getSiteConfig();
  // Locale-ul site-ului are prioritate față de cookie-ul user-ului — un site
  // BG forțează limba BG indiferent ce ar prefera utilizatorul (per cerință).
  const siteLocale = site.locale;
  const cookieLocale = await getLocale();
  const effectiveLocale = isLocale(siteLocale) ? siteLocale : (isLocale(cookieLocale) ? cookieLocale : 'ro');
  const messages = await getMessages({ locale: effectiveLocale });
  const htmlLang = isLocale(effectiveLocale) ? LOCALE_META[effectiveLocale].html : 'ro';

  // Inject CSS var pentru culoarea primară a brandului — UI-ul o citește prin var(--brand-primary)
  const brandVars = `:root{--brand-primary:${site.brand.primaryColor || '#d4af37'};--brand-accent:${site.brand.accentColor || '#f5d271'};}`;

  const baseUrl = site.id === 'fallback' ? APP_URL : siteUrlOf(site);

  // SSR injection a IP-ului real al clientului pentru OpenReplay tracker.
  // Vezi components/OpenReplay.tsx — fără asta, in-app browsers (TikTok,
  // Snapchat) care preload-ează pagina + user-i care închid rapid pierd
  // attribute IP (95% null rate observat în DB Hetzner). Cu IP-ul în HTML,
  // tracker.setUserID rulează ÎNAINTE de tracker.start() fără await fetch.
  const clientIp = await (async () => {
    try {
      const h = await headers();
      const xff = h.get('x-forwarded-for');
      const real = h.get('x-real-ip');
      const raw = (xff?.split(',')[0]?.trim()) || real?.trim() || '';
      // Sanitize — păstrăm doar caractere valide pentru IP v4/v6
      return raw.replace(/[^a-fA-F0-9.:]/g, '').slice(0, 45);
    } catch {
      return '';
    }
  })();
  const clientIpScript = clientIp
    ? `window.__CLIENT_IP__=${JSON.stringify(clientIp)};`
    : '';

  return (
    <html lang={htmlLang} className={`${cinzel.variable} ${manrope.variable}`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: brandVars }} />
        {clientIpScript && (
          <script dangerouslySetInnerHTML={{ __html: clientIpScript }} />
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(buildOrgJsonLd(site, baseUrl)) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(buildWebsiteJsonLd(site, baseUrl)) }}
        />
      </head>
      <body>
        {site.maintenanceMode && !(await isClientIpWhitelisted(site.ipWhitelist)) ? (
          <MaintenancePage site={site} locale={effectiveLocale} />
        ) : (
          <NextIntlClientProvider locale={effectiveLocale} messages={messages}>
            <SiteProvider value={site}>
              <ExperienceProvider initialSlug={resolveExperienceSlug({
                cookieSlug: (await cookies()).get('mc_ui')?.value ?? null,
                config: site.experienceConfig ?? null,
              }).slug}>
              <Providers>
                {children}
                <CursorHint />
                <Analytics />
                <Suspense fallback={null}>
                  <Tracker />
                </Suspense>
                <CookieConsent />
                <ConfirmDialogProvider />
                <Toaster />
                <ClientErrorReporter />
                <OpenReplay />
              </Providers>
              </ExperienceProvider>
            </SiteProvider>
          </NextIntlClientProvider>
        )}
      </body>
    </html>
  );
}
