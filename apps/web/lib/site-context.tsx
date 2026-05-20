'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { SiteConfig } from './site-config';

const SiteCtx = createContext<SiteConfig | null>(null);

/**
 * Provider montat în root layout (server fetch → pass ca prop). Orice client
 * component poate folosi `useSite()` ca să citească culoarea brandului, locale,
 * preț, etc. Pentru server components, importă direct `getSiteConfig()`.
 */
export function SiteProvider({ value, children }: { value: SiteConfig; children: ReactNode }) {
  // Expune locale-ul site-ului spre window pentru utilitare non-React (api.ts
  // getCurrentLocale) — pe site-uri „un domeniu = o limbă" cookie-ul NEXT_LOCALE
  // poate lipsi și nu vrem să fallback-uim pe NEXT_PUBLIC_DEFAULT_LOCALE.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as { __SITE_LOCALE__?: string }).__SITE_LOCALE__ = value.locale;
    }
  }, [value.locale]);
  return <SiteCtx.Provider value={value}>{children}</SiteCtx.Provider>;
}

export function useSite(): SiteConfig {
  const v = useContext(SiteCtx);
  if (!v) throw new Error('useSite() folosit în afara SiteProvider');
  return v;
}
