'use client';

import { useEffect, useState } from 'react';
import { SitesApi } from '@/lib/api/sites.api';

export interface ExperienceEntry {
  slug: string;
  label: string;
}

/** Slug-ul folosit pentru rândurile fără interfață (comenzi dinaintea acestei
 *  versiuni au `experienceSlug` NULL — au fost servite de designul clasic). */
export const DEFAULT_EXPERIENCE_SLUG = 'classic';

/** Fallback dacă `/admin/experiences` nu răspunde — lista reală vine din
 *  `EXPERIENCE_CATALOG` (API), nu e hardcodată în UI. */
const FALLBACK: ExperienceEntry[] = [
  { slug: 'classic', label: 'Classic' },
  { slug: 'cadou', label: 'Cadou' },
];

/** Etichetele din catalog au sufixe explicative („Classic (site-ul actual)").
 *  În filtre și coloane vrem doar numele. */
function shortLabel(label: string, slug: string): string {
  return label.replace(/\s*\(.*\)\s*$/, '').trim() || slug;
}

let _cache: ExperienceEntry[] | null = null;
let _inflight: Promise<ExperienceEntry[]> | null = null;

/** Fetch + cache global al catalogului de interfețe (nu se schimbă la runtime). */
export function fetchExperiences(): Promise<ExperienceEntry[]> {
  if (_cache) return Promise.resolve(_cache);
  if (_inflight) return _inflight;
  _inflight = SitesApi.listExperiences()
    .then((rows) => {
      const items = (rows ?? []).map((r) => ({ slug: r.slug, label: shortLabel(r.label, r.slug) }));
      _cache = items.length ? items : FALLBACK;
      _inflight = null;
      return _cache;
    })
    .catch(() => {
      _inflight = null;
      return FALLBACK;
    });
  return _inflight;
}

/**
 * Hook cu lista de interfețe disponibile (pentru select-uri și coloane).
 * `labelOf` întoarce eticheta scurtă, tratând NULL/gol ca `classic`.
 */
export function useExperiences(): {
  items: ExperienceEntry[];
  labelOf: (slug: string | null | undefined) => string;
} {
  const [items, setItems] = useState<ExperienceEntry[]>(() => _cache ?? FALLBACK);

  useEffect(() => {
    let alive = true;
    fetchExperiences().then((rows) => {
      if (alive) setItems(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  function labelOf(slug: string | null | undefined): string {
    const key = slug && slug.trim() ? slug.trim() : DEFAULT_EXPERIENCE_SLUG;
    return items.find((i) => i.slug === key)?.label ?? key;
  }

  return { items, labelOf };
}
