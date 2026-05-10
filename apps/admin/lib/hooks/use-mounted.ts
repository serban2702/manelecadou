'use client';

import { useEffect, useState } from 'react';

/**
 * Întoarce `false` la prima rendare (SSR + hydration), apoi `true` după mount.
 *
 * Folosit pentru a opri complet SSR-ul pe arborii care n-au nevoie de el (ex: dashboard admin).
 * Pe server și în primul tick client randăm un skeleton; după mount, randăm conținutul real.
 *
 * Avantaj: pagina apare instant ca skeleton, fără să aștepte HTML-ul serializat de la server,
 * iar React Query / useAsync fetchurile pornesc imediat după mount, în paralel cu render-ul.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
