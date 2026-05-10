import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { getSiteConfig, siteUrl as buildSiteUrl } from '@/lib/site-config';

const API_INTERNAL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:1501';

const STATIC_PAGES = [
  { path: '/',                 priority: 1.0, changeFrequency: 'weekly' as const },
  { path: '/studio',           priority: 0.9, changeFrequency: 'weekly' as const },
  { path: '/asculta',          priority: 0.9, changeFrequency: 'daily' as const },
  { path: '/top',              priority: 0.7, changeFrequency: 'daily' as const },
  { path: '/cadou',            priority: 0.8, changeFrequency: 'monthly' as const },
  { path: '/faq',              priority: 0.6, changeFrequency: 'monthly' as const },
  { path: '/contact',          priority: 0.5, changeFrequency: 'monthly' as const },
  { path: '/termeni',          priority: 0.3, changeFrequency: 'yearly' as const },
  { path: '/confidentialitate',priority: 0.3, changeFrequency: 'yearly' as const },
  { path: '/cookies',          priority: 0.3, changeFrequency: 'yearly' as const },
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
    url: `${baseUrl}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
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

  return [...staticItems, ...dynamicItems];
}
