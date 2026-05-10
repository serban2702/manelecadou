import type { Metadata } from 'next';
import { Cinzel, Manrope } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { Providers } from '@/lib/providers';
import { CursorHint } from '@/components/CursorHint';
import { Analytics } from '@/components/Analytics';
import { Tracker } from '@/components/Tracker';
import { CookieConsent } from '@/components/CookieConsent';
import { ClientErrorReporter } from '@/components/ClientErrorReporter';
import { LOCALE_META, isLocale } from '@/i18n/locales';
import { getSiteConfig, siteSupportEmail, siteUrl as siteUrlOf } from '@/lib/site-config';
import { SiteProvider } from '@/lib/site-context';
import './globals.css';

const cinzel = Cinzel({ subsets: ['latin'], weight: ['700', '900'], variable: '--font-cinzel', display: 'swap' });
const manrope = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-manrope', display: 'swap' });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:1500';

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

  return (
    <html lang={htmlLang} className={`${cinzel.variable} ${manrope.variable}`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: brandVars }} />
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
        {site.maintenanceMode ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#fff' }}>
            <h1>{site.name}</h1>
            <p>Site în mentenanță. Revino în câteva minute.</p>
          </div>
        ) : (
          <NextIntlClientProvider locale={effectiveLocale} messages={messages}>
            <SiteProvider value={site}>
              <Providers>
                {children}
                <CursorHint />
                <Analytics />
                <Tracker />
                <CookieConsent />
                <ClientErrorReporter />
              </Providers>
            </SiteProvider>
          </NextIntlClientProvider>
        )}
      </body>
    </html>
  );
}
