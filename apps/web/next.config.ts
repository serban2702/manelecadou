import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:1501',
    NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID ?? '',
    NEXT_PUBLIC_META_PIXEL_ID: process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '',
    NEXT_PUBLIC_TIKTOK_PIXEL_ID: process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID ?? '',
    NEXT_PUBLIC_DEFAULT_LOCALE: process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'ro',
    NEXT_PUBLIC_SHOW_LANG_SWITCHER: process.env.NEXT_PUBLIC_SHOW_LANG_SWITCHER ?? 'true',
  },
};

export default withNextIntl(nextConfig);
