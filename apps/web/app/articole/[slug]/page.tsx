import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { SiteShell } from '@/components/SiteShell';
import { getSiteConfig, siteUrl } from '@/lib/site-config';
import { getPagePath } from '@/lib/page-slugs';

const API_INTERNAL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:1501';

interface SeoPageDetail {
  slug: string;
  localizedSlug: string;
  category: string;
  locale: string;
  title: string;
  metaDescription: string;
  h1: string;
  excerpt: string | null;
  contentHtml: string;
  updatedAt: string;
}

async function fetchPage(slug: string): Promise<SeoPageDetail | null> {
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') || h.get('host') || '';
    const res = await fetch(
      `${API_INTERNAL}/api/public/seo-pages/${encodeURIComponent(slug)}`,
      {
        headers: { Host: host, 'X-Forwarded-Host': host },
        // 60s e plasă de siguranță. La regenerare, API-ul cheamă explicit
        // /api/internal/revalidate ca să invalideze tag-urile imediat.
        next: { revalidate: 60, tags: [`seo-page-${slug}`] },
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as SeoPageDetail;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [page, site] = await Promise.all([fetchPage(slug), getSiteConfig()]);
  if (!page) {
    const t = await getTranslations('articlesPage');
    return { title: t('notFound') };
  }
  const baseUrl = siteUrl(site);
  // Canonical → varianta localizată (URL-ul „bun") chiar dacă userul a venit
  // pe master slug-ul vechi. Google va indexa doar URL-ul canonic.
  const canonicalSlug = page.localizedSlug || slug;
  const url = `${baseUrl}/articole/${canonicalSlug}`;
  const ogImage = site.brand?.ogImageUrl ?? `${baseUrl}/icon-512.png`;
  return {
    // absolute: ignoră template-ul „%s · BrandName" din root layout —
    // title-ul generat cu AI conține deja brand-ul ca suffix.
    title: { absolute: page.title },
    description: page.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title: page.title,
      description: page.metaDescription,
      siteName: site.name,
      images: [{ url: ogImage, width: 1200, height: 630, alt: page.h1 }],
      locale: `${site.locale}_${site.locale.toUpperCase()}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: page.title,
      description: page.metaDescription,
      images: [ogImage],
    },
  };
}

export default async function ArticolePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [page, site] = await Promise.all([fetchPage(slug), getSiteConfig()]);
  if (!page) notFound();

  // Canonical URL = localizedSlug (varianta tradusă). Dacă vizitatorul a venit
  // pe master slug-ul vechi (cel din SEO_SLUG_TEMPLATES, în română), facem
  // 308 redirect către varianta nativă — fără să spargem link-urile vechi.
  if (page.localizedSlug && page.localizedSlug !== slug) {
    redirect(`/articole/${page.localizedSlug}`);
  }
  const t = await getTranslations('articlesPage');
  const priceText = `${(site.basePriceCents / 100).toFixed(2)} ${site.currency}`;

  const baseUrl = siteUrl(site);
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: page.h1,
    description: page.metaDescription,
    inLanguage: page.locale,
    datePublished: page.updatedAt,
    dateModified: page.updatedAt,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${baseUrl}/articole/${slug}` },
    publisher: {
      '@type': 'Organization',
      name: site.name,
      url: baseUrl,
    },
  };
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: site.name, item: baseUrl },
      { '@type': 'ListItem', position: 2, name: 'Articole', item: `${baseUrl}/articole` },
      { '@type': 'ListItem', position: 3, name: page.h1, item: `${baseUrl}/articole/${slug}` },
    ],
  };

  return (
    <SiteShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <main style={{ maxWidth: 760, margin: '40px auto', padding: '0 20px' }}>
        <nav style={{ fontSize: 12, color: 'rgba(255,245,220,0.5)', marginBottom: 16 }}>
          <Link href="/" style={{ color: 'inherit' }}>{t('breadcrumbHome')}</Link>
          <span style={{ margin: '0 6px' }}>›</span>
          <Link href={getPagePath(site.locale, 'articole')} style={{ color: 'inherit' }}>{t('breadcrumbAll')}</Link>
          <span style={{ margin: '0 6px' }}>›</span>
          <span>{page.h1}</span>
        </nav>

        <h1
          className="gold-text serif"
          style={{ fontSize: 36, lineHeight: 1.15, marginBottom: 8 }}
        >
          {page.h1}
        </h1>
        {page.excerpt && (
          <p
            className="ld"
            style={{ fontSize: 17, lineHeight: 1.55, marginBottom: 24, color: 'rgba(255,245,220,0.75)' }}
          >
            {page.excerpt}
          </p>
        )}

        <article
          className="seo-article"
          dangerouslySetInnerHTML={{ __html: page.contentHtml }}
        />

        <div
          style={{
            marginTop: 40,
            padding: 24,
            borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(90,13,24,0.4), rgba(40,12,18,0.4))',
            border: '1px solid var(--gold)',
            textAlign: 'center',
          }}
        >
          <div className="gold-text serif" style={{ fontSize: 22, marginBottom: 8 }}>
            {t('articleCtaTitle')}
          </div>
          <p style={{ fontSize: 14, color: 'rgba(255,245,220,0.7)', marginBottom: 18 }}>
            {t('articleCtaSub')}
          </p>
          <Link href={getPagePath(site.locale, 'studio')} className="btn btn-gold btn-lg" style={{ textDecoration: 'none' }}>
            {t('articleCtaButton', { price: priceText })}
          </Link>
        </div>

        <div style={{ marginTop: 32, textAlign: 'center', fontSize: 12 }}>
          <Link href={getPagePath(site.locale, 'articole')} style={{ color: 'var(--gold)', textDecoration: 'none' }}>
            {t('backToAll')}
          </Link>
        </div>
      </main>
    </SiteShell>
  );
}
