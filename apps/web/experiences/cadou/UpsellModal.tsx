'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { usePackages } from '@/experiences/use-packages';
import type { PackageTier, SitePackage } from '@/lib/site-shared';

type Upsell = { title: string; body: string; targetTier: 'plus' | 'premium' };

/** Cheia „am arătat deja upsell-ul pentru generarea asta". */
function seenKey(generationId: string): string {
  return `mc_upsell_seen:${generationId}`;
}

export function upsellAlreadySeen(generationId: string): boolean {
  try {
    return window.localStorage.getItem(seenKey(generationId)) === '1';
  } catch {
    return false;
  }
}

function markUpsellSeen(generationId: string) {
  try {
    window.localStorage.setItem(seenKey(generationId), '1');
  } catch {
    /* storage blocat */
  }
}

/**
 * Upsell-ul propus pentru pachetul curent.
 *
 * Sursa de adevăr e configul din admin
 * (`experienceConfig.items[<interfață>].packages[<tier>].upsell`). Dacă acolo e
 * `null` (implicit), propunem următorul pachet ACTIV mai scump, cu textele
 * traduse — parametrizate cu date reale din pachetul țintă (nume, număr de poze
 * la colaj), nu cu cifre îngropate în traduceri.
 * Fără pachet țintă activ ⇒ fără upsell.
 */
function useUpsell(currentTier: PackageTier): { upsell: Upsell | null; target: SitePackage | null } {
  const t = useTranslations('cadou.upsell');
  const { byTier, items } = usePackages();
  const current = byTier[currentTier] ?? null;

  const configured = current?.upsell ?? null;
  const targetFromConfig = configured ? byTier[configured.targetTier] ?? null : null;
  if (configured && configured.title && configured.body && targetFromConfig?.enabled !== false) {
    return { upsell: configured, target: targetFromConfig };
  }
  if (configured) return { upsell: null, target: null };

  // Default: primul pachet activ mai scump decât cel curent.
  const target = items
    .filter((p) => p.tier !== currentTier && p.priceCents > (current?.priceCents ?? 0))
    .sort((a, b) => a.priceCents - b.priceCents)[0];
  if (!target || (target.tier !== 'plus' && target.tier !== 'premium')) {
    return { upsell: null, target: null };
  }
  const photos = String(target.collagePhotoLimit ?? 0);
  const body = target.collageFullTrack
    ? t('bodyFullTrack', { name: target.label, photos })
    : t('bodyChorus', { name: target.label, photos });
  return {
    upsell: { title: t('title', { name: target.label }), body, targetTier: target.tier },
    target,
  };
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
  const { upsell } = useUpsell(currentTier);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!upsell) return null;

  const close = () => {
    markUpsellSeen(generationId);
    onClose();
  };

  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.createUpgradeCheckoutSession({
        generationId,
        targetTier: upsell.targetTier,
      });
      markUpsellSeen(generationId);
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
          <button type="button" className="cadou-ghost" onClick={close}>{t('decline')}</button>
          <button type="button" className="cadou-cta" onClick={go} disabled={busy}>
            {/* Fără cifră pe buton: la upgrade Stripe taxează DIFERENȚA față de
                cât s-a plătit deja (inclusiv promo), pe care clientul o vede pe
                pagina de checkout. O estimare aici ar putea fi greșită. */}
            {busy ? t('busy') : t('cta')}
          </button>
        </div>
      </div>
    </div>
  );
}
