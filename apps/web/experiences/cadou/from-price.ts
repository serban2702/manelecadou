'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PACKAGES } from '@/lib/packages';

/** Prețul „de la" pentru Cadou (pachet basic / 1+1), nu basePriceCents. */
export function useCadouFromPrice(): number {
  const fallback = PACKAGES.find((p) => p.tier === 'basic')?.priceCents ?? 2999;
  const [cents, setCents] = useState(fallback);
  useEffect(() => {
    let cancelled = false;
    api.priceQuote('basic')
      .then((q) => { if (!cancelled && q.total > 0) setCents(q.total); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  return cents;
}
