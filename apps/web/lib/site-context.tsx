'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { SiteConfig } from './site-config';
import { normalizeLocale } from '@/i18n/locales';

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
  //
  // Scris ÎN RANDARE, nu doar din efect: efectele rulează după ce s-a montat tot
  // arborele, iar o cerere pornită de un component montat mai devreme citea încă
  // globala goală și cădea pe limba implicită. E o scriere idempotentă pe
  // `window`, nu stare React, deci repetarea ei la fiecare randare n-are efect.
  if (typeof window !== 'undefined') {
    (window as unknown as { __SITE_LOCALE__?: string }).__SITE_LOCALE__ =
      normalizeLocale(value.locale) ?? value.locale;
  }
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as { __SITE_LOCALE__?: string }).__SITE_LOCALE__ =
        normalizeLocale(value.locale) ?? value.locale;
    }
  }, [value.locale]);
  return <SiteCtx.Provider value={value}>{children}</SiteCtx.Provider>;
}

export function useSite(): SiteConfig {
  const v = useContext(SiteCtx);
  if (!v) throw new Error('useSite() folosit în afara SiteProvider');
  return v;
}
