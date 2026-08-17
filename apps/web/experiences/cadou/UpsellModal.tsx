'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { PackageTier } from '@/lib/packages';

export function CadouUpsellModal({
  generationId,
  currentTier,
  onClose,
}: {
  generationId: string;
  currentTier: PackageTier;
  onClose: () => void;
}) {
  const upsell = currentTier === 'basic'
    ? { title: 'Vrei și poze pentru social?', body: 'Upgrade la Plus: manea mai lungă + poze pentru TikTok / Instagram.', targetTier: 'plus' as const }
    : currentTier === 'plus'
      ? { title: 'Adaugă videoclipul', body: 'Upgrade la Premium și primești videoclipul personalizat.', targetTier: 'premium' as const }
      : null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!upsell) return null;

  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.createUpgradeCheckoutSession({
        generationId,
        targetTier: upsell.targetTier,
      });
      if (r.upgraded) {
        onClose();
        window.location.reload();
        return;
      }
      if (r.url) {
        window.location.href = r.url;
        return;
      }
      setErr('Nu am putut deschide upgrade-ul.');
    } catch {
      setErr('Nu am putut deschide upgrade-ul.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80, padding: 16,
      }}
    >
      <div className="cadou-pack rec" style={{ maxWidth: 420, width: '100%' }}>
        <h3 style={{ marginTop: 0 }}>{upsell.title}</h3>
        <p style={{ color: 'var(--cadou-muted)' }}>{upsell.body}</p>
        {err && <p className="cadou-err">{err}</p>}
        <div className="cadou-row" style={{ marginTop: 16 }}>
          <button type="button" className="cadou-ghost" onClick={onClose}>Nu, mulțumesc</button>
          <button type="button" className="cadou-cta" onClick={go} disabled={busy}>
            {busy ? 'Se deschide…' : 'Upgrade →'}
          </button>
        </div>
      </div>
    </div>
  );
}
