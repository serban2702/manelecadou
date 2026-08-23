import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // NU adăuga aici `API_INTERNAL_URL`: cheile din `env` se substituie la build,
  // iar în imaginea Docker variabila nu există atunci → s-ar bake `""` și
  // valoarea de la runtime ar fi ignorată. Vezi lib/api-internal.ts.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:1501',
    NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID ?? '',
    NEXT_PUBLIC_META_PIXEL_ID: process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '',
    NEXT_PUBLIC_TIKTOK_PIXEL_ID: process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID ?? '',
    NEXT_PUBLIC_DEFAULT_LOCALE: process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'ro',
    NEXT_PUBLIC_SHOW_LANG_SWITCHER: process.env.NEXT_PUBLIC_SHOW_LANG_SWITCHER ?? 'true',
  },
  // Doar pentru dev: în producție reverse proxy-ul rutează `/uploads/*` direct
  // spre API, deci rewrite-ul ăsta nu se atinge niciodată. (Destinația se
  // fixează la build în routes-manifest.json — încă un motiv să nu depindem de
  // ea în prod.)
  async rewrites() {
    const api = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1501';
    return [{ source: '/uploads/:path*', destination: `${api}/uploads/:path*` }];
  },
};

export default withNextIntl(nextConfig);
