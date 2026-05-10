import type { MetadataRoute } from 'next';
import { getSiteConfig, siteUrl as buildSiteUrl } from '@/lib/site-config';

/**
 * robots.txt per-site: fiecare domeniu pointează la propriul sitemap și
 * declară propriul host canonical. Site-urile inactive (`active=false` în
 * admin) primesc `disallow: '/'` ca să nu fie indexate.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = await getSiteConfig();
  const baseUrl = buildSiteUrl(site);

  // Site dezactivat sau în mentenanță → blocăm indexarea complet
  if (!site.active || site.maintenanceMode) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
      host: baseUrl,
    };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/cont', '/login', '/checkout/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
