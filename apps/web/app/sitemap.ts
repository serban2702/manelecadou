import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { getSiteConfig, siteUrl as buildSiteUrl } from '@/lib/site-config';
import { getLegalPath } from '@/lib/legal-slugs';
import { getPagePath, type PageKey } from '@/lib/page-slugs';
import { apiInternalUrl } from '@/lib/api-internal';

const API_INTERNAL = apiInternalUrl();

const STATIC_PAGES: Array<{ key: PageKey | 'home'; priority: number; changeFrequency: 'weekly' | 'daily' | 'monthly' }> = [
  { key: 'home',          priority: 1.0, changeFrequency: 'weekly' },
  { key: 'studio',        priority: 0.9, changeFrequency: 'weekly' },
  { key: 'asculta',       priority: 0.9, changeFrequency: 'daily' },
  { key: 'top',           priority: 0.7, changeFrequency: 'daily' },
  { key: 'articole',      priority: 0.8, changeFrequency: 'weekly' },
  { key: 'faq',           priority: 0.6, changeFrequency: 'monthly' },
  { key: 'contact',       priority: 0.5, changeFrequency: 'monthly' },
];

/**
 * Sitemap per-site: fiecare domeniu generează propriul sitemap, cu URL-uri pe
 * domeniul lui și DOAR generațiile aparținând site-ului. Niciun cross-link între
 * site-uri (per cerință — site-urile sunt entități SEO complet izolate, fără
 * hreflang între ele).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = await getSiteConfig();
  const baseUrl = buildSiteUrl(site);
  const now = new Date();

  const staticItems = STATIC_PAGES.map((p) => ({
    url: `${baseUrl}${p.key === 'home' ? '' : getPagePath(site.locale, p.key)}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));

  // Paginile legale: slug-ul depinde de locale-ul site-ului (RO „/termeni",
  // BG „/uslovia", etc.). Vezi `lib/legal-slugs.ts`.
  const legalItems: MetadataRoute.Sitemap = (
    ['terms', 'privacy', 'cookies'] as const
  ).map((page) => ({
    url: `${baseUrl}${getLegalPath(site.locale, page)}`,
    lastModified: now,
    changeFrequency: 'yearly' as const,
    priority: 0.3,
  }));

  // Generațiile publice ale site-ului curent — fetch cu Host forward, API
  // returnează doar piesele cu siteId = site curent (filtrare în service).
  let dynamicItems: MetadataRoute.Sitemap = [];
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') || h.get('host') || site.domain;
    const res = await fetch(`${API_INTERNAL}/api/generations/recent?limit=50`, {
      headers: { Host: host, 'X-Forwarded-Host': host },
      next: { revalidate: 600, tags: ['site-sitemap'] },
    });
    if (res.ok) {
      const items: Array<{ id: string; createdAt?: string }> = await res.json();
      dynamicItems = items.map((g) => ({
        url: `${baseUrl}/m/${g.id}`,
        lastModified: g.createdAt ? new Date(g.createdAt) : now,
        changeFrequency: 'monthly' as const,
        priority: 0.5,
      }));
    }
  } catch {
    // tolerăm eșecul — sitemap-ul rămâne cu doar paginile statice
  }

  // Paginile SEO „articole" — 40-50 entries per site, generate cu OpenAI.
  let seoItems: MetadataRoute.Sitemap = [];
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') || h.get('host') || site.domain;
    const res = await fetch(`${API_INTERNAL}/api/public/seo-pages`, {
      headers: { Host: host, 'X-Forwarded-Host': host },
      next: { revalidate: 1800, tags: ['site-sitemap-seo'] },
    });
    if (res.ok) {
      const payload = (await res.json()) as { items: Array<{ slug: string; localizedSlug?: string; updatedAt?: string }> };
      const articlesPath = getPagePath(site.locale, 'articole');
      seoItems = payload.items.map((p) => ({
        url: `${baseUrl}${articlesPath}/${p.localizedSlug || p.slug}`,
        lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      }));
    }
  } catch {
    // tolerăm eșecul
  }

  return [...staticItems, ...legalItems, ...dynamicItems, ...seoItems];
}
