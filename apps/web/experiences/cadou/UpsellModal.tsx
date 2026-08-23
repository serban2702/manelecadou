'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useSite } from '@/lib/site-context';
import { useExperience } from '@/lib/experience-context';
import type { PackageTier } from '@/lib/packages';

type Upsell = { title: string; body: string; targetTier: 'plus' | 'premium' };

/**
 * Upsell-ul propus pentru pachetul curent. Sursa de adevăr e configul din admin
 * (`experienceConfig.items[<interfață>].packages[<tier>].upsell`); dacă site-ul
 * n-are încă entry pentru pachetul ăsta, cădem pe textele default traduse.
 * `upsell: null` setat explicit din admin = fără upsell.
 */
function useUpsell(currentTier: PackageTier): Upsell | null {
  const site = useSite();
  const exp = useExperience();
  const t = useTranslations('cadou.upsell');
  const packages = site.experienceConfig?.items?.[exp.slug]?.packages;
  const configured = packages?.[currentTier];
  if (configured) {
    const u = configured.upsell;
    return u && u.title && u.body ? u : null;
  }
  if (currentTier === 'basic') {
    return { title: t('basicTitle'), body: t('basicBody'), targetTier: 'plus' };
  }
  if (currentTier === 'plus') {
    return { title: t('plusTitle'), body: t('plusBody'), targetTier: 'premium' };
  }
  return null;
}

export function CadouUpsellModal({
  generationId,
  currentTier,
  onClose,
}: {
  generationId: string;
  currentTier: PackageTier;
  onClose: () => void;
}) {
  const t = useTranslations('cadou.upsell');
  const upsell = useUpsell(currentTier);
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
      setErr(t('error'));
    } catch {
      setErr(t('error'));
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
          <button type="button" className="cadou-ghost" onClick={onClose}>{t('decline')}</button>
          <button type="button" className="cadou-cta" onClick={go} disabled={busy}>
            {busy ? t('busy') : t('cta')}
          </button>
        </div>
      </div>
    </div>
  );
}
