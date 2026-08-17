'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import View from '@/app/m/[id]/view';
import { api } from '@/lib/api';
import type { PackageTier } from '@/lib/packages';
import { CadouShell } from './Shell';
import { CadouUpsellModal } from './UpsellModal';

export default function CadouSongView() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [upsellTier, setUpsellTier] = useState<PackageTier | null>(null);

  useEffect(() => {
    if (!id) return;
    const key = `mc_upsell_${id}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const g = await api.getGeneration(id);
        if (cancelled) return;
        if (g.status !== 'succeeded') return;
        const tier = (g.packageTier === 'plus' || g.packageTier === 'premium' ? g.packageTier : 'basic') as PackageTier;
        if (tier === 'premium') return;
        setUpsellTier(tier);
      } catch {
        /* ignore */
      }
    };
    void tick();
    const t = setInterval(tick, 4000);
    return () => { cancelled = true; clearInterval(t); };
  }, [id]);

  const closeUpsell = () => {
    if (id) {
      try { localStorage.setItem(`mc_upsell_${id}`, '1'); } catch { /* ignore */ }
    }
    setUpsellTier(null);
  };

  return (
    <CadouShell>
      <div className="cadou-wrap">
        <View />
      </div>
      {id && upsellTier && (
        <CadouUpsellModal generationId={id} currentTier={upsellTier} onClose={closeUpsell} />
      )}
    </CadouShell>
  );
}
