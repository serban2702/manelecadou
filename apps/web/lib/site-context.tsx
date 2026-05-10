'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { SiteConfig } from './site-config';

const SiteCtx = createContext<SiteConfig | null>(null);

/**
 * Provider montat în root layout (server fetch → pass ca prop). Orice client
 * component poate folosi `useSite()` ca să citească culoarea brandului, locale,
 * preț, etc. Pentru server components, importă direct `getSiteConfig()`.
 */
export function SiteProvider({ value, children }: { value: SiteConfig; children: ReactNode }) {
  return <SiteCtx.Provider value={value}>{children}</SiteCtx.Provider>;
}

export function useSite(): SiteConfig {
  const v = useContext(SiteCtx);
  if (!v) throw new Error('useSite() folosit în afara SiteProvider');
  return v;
}
