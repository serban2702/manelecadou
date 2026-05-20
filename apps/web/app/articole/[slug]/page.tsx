import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { SiteShell } from '@/components/SiteShell';
import { getSiteConfig, siteUrl } from '@/lib/site-config';
import { getPagePath } from '@/lib/page-slugs';

const API_INTERNAL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:1501';

interface SeoPageDetail {
  slug: string;
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
        next: { revalidate: 1800, tags: [`seo-page-${slug}`] },
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
    return { title: 'Articol negăsit' };
  }
  const baseUrl = siteUrl(site);
  const url = `${baseUrl}/articole/${slug}`;
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
          <Link href="/" style={{ color: 'inherit' }}>Acasă</Link>
          <span style={{ margin: '0 6px' }}>›</span>
          <Link href={getPagePath(site.locale, 'articole')} style={{ color: 'inherit' }}>Articole</Link>
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
            Gata să faci propria manea?
          </div>
          <p style={{ fontSize: 14, color: 'rgba(255,245,220,0.7)', marginBottom: 18 }}>
            Demo gratis în 30 secunde. Plătești doar dacă vrei tot.
          </p>
          <Link href={getPagePath(site.locale, 'studio')} className="btn btn-gold btn-lg" style={{ textDecoration: 'none' }}>
            🎤 Începe acum — {(site.basePriceCents / 100).toFixed(2)} {site.currency}
          </Link>
        </div>

        <div style={{ marginTop: 32, textAlign: 'center', fontSize: 12 }}>
          <Link href={getPagePath(site.locale, 'articole')} style={{ color: 'var(--gold)', textDecoration: 'none' }}>
            ← Toate articolele
          </Link>
        </div>
      </main>
    </SiteShell>
  );
}
