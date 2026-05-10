'use client';

import { useEffect, useState } from 'react';
import { SitesApi, type SiteDto, ALL_SITES, getSelectedSiteId } from '@/lib/api/sites.api';

export interface SiteMapEntry {
  id: string;
  slug: string;
  name: string;
  domain: string;
  primaryColor?: string;
}

let _cache: SiteMapEntry[] | null = null;
let _inflight: Promise<SiteMapEntry[]> | null = null;

/** Fetch + cache global al listei de site-uri (pentru a randa coloana „Site" din tabele). */
export function fetchSitesMap(): Promise<SiteMapEntry[]> {
  if (_cache) return Promise.resolve(_cache);
  if (_inflight) return _inflight;
  _inflight = SitesApi.list()
    .then((all) =>
      all.map<SiteMapEntry>((s: SiteDto) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        domain: s.domain,
        primaryColor: s.brand?.primaryColor,
      })),
    )
    .then((items) => {
      _cache = items;
      _inflight = null;
      return items;
    })
    .catch((err) => {
      _inflight = null;
      throw err;
    });
  return _inflight;
}

export function invalidateSitesMap(): void {
  _cache = null;
}

/**
 * Hook care întoarce un Map<siteId, SiteMapEntry> + flag-ul `isAllSelected` (selectorul
 * e pe „Toate"). Tabelele admin afișează coloana „Site" doar când isAllSelected=true.
 */
export function useSitesMap(): {
  byId: Map<string, SiteMapEntry>;
  isAllSelected: boolean;
  loaded: boolean;
} {
  const [byId, setById] = useState<Map<string, SiteMapEntry>>(() => new Map());
  const [loaded, setLoaded] = useState<boolean>(_cache !== null);
  const [isAllSelected, setIsAllSelected] = useState<boolean>(
    typeof window === 'undefined' ? true : getSelectedSiteId() === ALL_SITES,
  );

  useEffect(() => {
    let alive = true;
    fetchSitesMap()
      .then((items) => {
        if (!alive) return;
        setById(new Map(items.map((s) => [s.id, s])));
        setLoaded(true);
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    function onSiteChanged() {
      setIsAllSelected(getSelectedSiteId() === ALL_SITES);
    }
    window.addEventListener('mc:site-changed', onSiteChanged);
    return () => window.removeEventListener('mc:site-changed', onSiteChanged);
  }, []);

  return { byId, isAllSelected, loaded };
}
