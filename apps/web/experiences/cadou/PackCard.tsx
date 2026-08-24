'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { formatPrice } from '@/lib/site-shared';
import type { SitePackage } from '@/lib/site-shared';
import { useSite } from '@/lib/site-context';
import { usePackages } from '@/experiences/use-packages';

/**
 * Cardul de pachet pe interfața Cadou. TOT ce afișează (nume, preț, preț tăiat,
 * „ce conține", eticheta de livrare) vine din pachetul rezolvat de API — adică
 * din ce a editat proprietarul în admin, pe interfața asta. Zero cifre și zero
 * texte din cod: pe un site bulgar/grec bullet-urile sunt cele scrise acolo, nu
 * literale românești.
 */
export function CadouPackCard({
  pkg,
  featured,
  selected,
  onSelect,
  ctaHref,
}: {
  pkg: SitePackage;
  featured?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  ctaHref?: string;
}) {
  const site = useSite();
  const t = useTranslations('cadou.packs');
  const compare =
    pkg.compareAtCents && pkg.compareAtCents > pkg.priceCents ? pkg.compareAtCents : null;
  const cls = [
    'cadou-pack',
    featured ? 'is-featured' : '',
    selected ? 'is-on' : '',
  ].filter(Boolean).join(' ');

  const inner = (
    <>
      {featured && <div className="cadou-pack-badge">{t('recommended')}</div>}
      <div className="cadou-pack-name">{pkg.label}</div>
      <div className="cadou-pack-price">
        {compare && (
          <s style={{ fontSize: '0.6em', fontWeight: 600, opacity: 0.55, marginRight: 8 }}>
            {formatPrice(site, compare)}
          </s>
        )}
        {formatPrice(site, pkg.priceCents)}
      </div>
      <ul className="cadou-pack-list">
        {pkg.features.map((f) => (
          <li key={f}><span aria-hidden>✓</span>{f}</li>
        ))}
      </ul>
      {pkg.deliveryLabel && <p className="cadou-pack-ship">⚡ {pkg.deliveryLabel}</p>}
      {ctaHref ? (
        <Link href={ctaHref} className="cadou-cta cadou-pack-cta">{t('cta', { name: pkg.label })}</Link>
      ) : null}
    </>
  );

  if (onSelect) {
    return (
      <button type="button" className={cls} onClick={onSelect} aria-pressed={!!selected}>
        {inner}
      </button>
    );
  }

  return <article className={cls}>{inner}</article>;
}

/** Schelet cât timp configul de site (deci și pachetele) n-a ajuns la client. */
function CadouPackSkeleton() {
  return (
    <div className="cadou-packs" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="cadou-pack is-skel">
          <div className="cadou-skel-line sm" />
          <div className="cadou-skel-line lg" />
          <div className="cadou-skel-line" />
          <div className="cadou-skel-line" />
          <div className="cadou-skel-line" />
        </div>
      ))}
    </div>
  );
}

export function CadouPackGrid({
  selected,
  onSelect,
  ctaHref,
}: {
  selected?: string;
  onSelect?: (tier: SitePackage['tier']) => void;
  ctaHref?: string;
}) {
  const { items, loaded, recommendedTier } = usePackages();
  if (!loaded || items.length === 0) return <CadouPackSkeleton />;
  return (
    <div className="cadou-packs">
      {items.map((p) => (
        <CadouPackCard
          key={p.tier}
          pkg={p}
          featured={p.tier === recommendedTier}
          selected={selected === p.tier}
          onSelect={onSelect ? () => onSelect(p.tier) : undefined}
          ctaHref={ctaHref}
        />
      ))}
    </div>
  );
}
