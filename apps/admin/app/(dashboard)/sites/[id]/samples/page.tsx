'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { setSelectedSiteId } from '@/lib/api/sites.api';

/**
 * Pagina veche `/sites/:id/samples` a fost integrată în noua pagină per-site
 * `/site` (tab „Categorii & Mostre"). Aici doar redirectăm pentru bookmarks
 * vechi: setăm site-ul în selector + navigăm.
 */
export default function LegacySamplesRedirect() {
  const params = useParams<{ id: string }>();
  useEffect(() => {
    if (params?.id) setSelectedSiteId(params.id);
    window.location.replace('/site');
  }, [params?.id]);
  return (
    <div className="p-6 text-center text-muted-foreground text-sm">
      Pagina a fost mutată. Redirectăm spre <code>/site</code>...
    </div>
  );
}
