'use client';

import Link from 'next/link';
import { PACKAGES, type PackageTier } from '@/lib/packages';
import { formatPrice } from '@/lib/site-shared';
import { useSite } from '@/lib/site-context';

export function CadouPackCard({
  tier,
  selected,
  onSelect,
  ctaHref,
}: {
  tier: PackageTier;
  selected?: boolean;
  onSelect?: () => void;
  ctaHref?: string;
}) {
  const site = useSite();
  const pkg = PACKAGES.find((p) => p.tier === tier)!;
  const featured = !!pkg.recommended;
  const cls = [
    'cadou-pack',
    featured ? 'is-featured' : '',
    selected ? 'is-on' : '',
  ].filter(Boolean).join(' ');

  const inner = (
    <>
      {featured && <div className="cadou-pack-badge">Recomandat</div>}
      <div className="cadou-pack-name">{pkg.nameRO}</div>
      <div className="cadou-pack-price">{formatPrice(site, pkg.priceCents)}</div>
      <ul className="cadou-pack-list">
        {pkg.features.map((f) => (
          <li key={f}><span aria-hidden>✓</span>{f}</li>
        ))}
      </ul>
      {ctaHref ? (
        <Link href={ctaHref} className="cadou-cta cadou-pack-cta">Alege {pkg.nameRO}</Link>
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

export function CadouPackGrid({
  selected,
  onSelect,
  ctaHref,
}: {
  selected?: PackageTier;
  onSelect?: (tier: PackageTier) => void;
  ctaHref?: string;
}) {
  return (
    <div className="cadou-packs">
      {PACKAGES.map((p) => (
        <CadouPackCard
          key={p.tier}
          tier={p.tier}
          selected={selected === p.tier}
          onSelect={onSelect ? () => onSelect(p.tier) : undefined}
          ctaHref={ctaHref}
        />
      ))}
    </div>
  );
}
