'use client';

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { getExperience } from '@/experiences/registry';
import type { ExperienceModule } from '@/experiences/types';

const COOKIE = 'mc_ui';

const ExperienceCtx = createContext<ExperienceModule | null>(null);

export function ExperienceProvider({
  initialSlug,
  children,
}: {
  initialSlug: string;
  children: ReactNode;
}) {
  const mod = useMemo(() => getExperience(initialSlug), [initialSlug]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as unknown as { __MC_EXPERIENCE__?: string }).__MC_EXPERIENCE__ = mod.slug;
    try {
      window.localStorage.setItem(COOKIE, mod.slug);
    } catch {
      /* storage blocked */
    }
  }, [mod.slug]);

  return <ExperienceCtx.Provider value={mod}>{children}</ExperienceCtx.Provider>;
}

export function useExperience(): ExperienceModule {
  const v = useContext(ExperienceCtx);
  if (!v) return getExperience('classic');
  return v;
}
