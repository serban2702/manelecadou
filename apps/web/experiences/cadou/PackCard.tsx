'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useQueries } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PACKAGES, getPackage, type PackageTier } from '@/lib/packages';
import { formatPrice } from '@/lib/site-shared';
import { useSite } from '@/lib/site-context';

const TIERS: PackageTier[] = ['basic', 'plus', 'premium'];

export interface CadouPackQuote {
  /** Prețul REAL, cel pe care îl taxează Stripe (cents, moneda site-ului). */
  total: number;
  /** Preț „tăiat" (marketing). Doar dacă e strict mai mare decât `total`. */
  compareAtCents: number | null;
}

export interface CadouPackQuotes {
  /** False până când quote-urile chiar au venit de la API (afișăm fallback-ul din cod). */
  loaded: boolean;
  byTier: Record<PackageTier, CadouPackQuote>;
}

/**
 * Prețurile celor 3 pachete, din quote-ul API (`/api/payments/quote`) — SINGURA
 * sursă de adevăr, fiindcă ține cont de prețul per-site (`packagePricesCents`)
 * și de override-urile pe interfață. Constantele din `@/lib/packages` sunt doar
 * fallback până vine răspunsul (pe un site în EUR ele ar afișa cifre de RON).
 *
 * Aceeași `queryKey` ca în interfața classic (`components/Generator.tsx`) →
 * cache partajat, deci hero-ul și grila de tarife nu pot diverge.
 */
export function useCadouPackageQuotes(): CadouPackQuotes {
  const results = useQueries({
    queries: TIERS.map((tier) => ({
      queryKey: ['package-quote', tier],
      queryFn: () => api.priceQuote(tier),
      staleTime: 5 * 60_000,
    })),
  });

  const data = results.map((r) => r.data);
  const key = data.map((q) => (q ? `${q.total}:${q.compareAtCents ?? ''}` : '')).join('|');

  return useMemo(() => {
    const byTier = {} as Record<PackageTier, CadouPackQuote>;
    let loaded = true;
    TIERS.forEach((tier, i) => {
      const q = data[i];
      if (!q) loaded = false;
      const total = q && q.total > 0 ? q.total : getPackage(tier).priceCents;
      byTier[tier] = {
        total,
        compareAtCents:
          q?.compareAtCents && q.compareAtCents > total ? q.compareAtCents : null,
      };
    });
    return { loaded, byTier };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export function CadouPackCard({
  tier,
  selected,
  onSelect,
  ctaHref,
  priceCents,
  compareAtCents,
}: {
  tier: PackageTier;
  selected?: boolean;
  onSelect?: () => void;
  ctaHref?: string;
  /** Prețul real (din quote). Lipsă = fallback pe constanta din cod. */
  priceCents?: number;
  /** Preț „tăiat" (din quote). Afișat doar dacă e mai mare decât prețul real. */
  compareAtCents?: number | null;
}) {
  const site = useSite();
  const t = useTranslations('cadou.packs');
  const pkg = getPackage(tier);
  const featured = !!pkg.recommended;
  const price = typeof priceCents === 'number' && priceCents > 0 ? priceCents : pkg.priceCents;
  const compare =
    typeof compareAtCents === 'number' && compareAtCents > price ? compareAtCents : null;
  const cls = [
    'cadou-pack',
    featured ? 'is-featured' : '',
    selected ? 'is-on' : '',
  ].filter(Boolean).join(' ');

  const inner = (
    <>
      {featured && <div className="cadou-pack-badge">{t('recommended')}</div>}
      <div className="cadou-pack-name">{pkg.nameRO}</div>
      <div className="cadou-pack-price">
        {compare && (
          <s style={{ fontSize: '0.6em', fontWeight: 600, opacity: 0.55, marginRight: 8 }}>
            {formatPrice(site, compare)}
          </s>
        )}
        {formatPrice(site, price)}
      </div>
      <ul className="cadou-pack-list">
        {pkg.features.map((f) => (
          <li key={f}><span aria-hidden>✓</span>{f}</li>
        ))}
      </ul>
      {ctaHref ? (
        <Link href={ctaHref} className="cadou-cta cadou-pack-cta">{t('cta', { name: pkg.nameRO })}</Link>
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
  quotes,
}: {
  selected?: PackageTier;
  onSelect?: (tier: PackageTier) => void;
  ctaHref?: string;
  /** Quote-urile din părinte. Lipsă = grila și le ia singură (același cache). */
  quotes?: CadouPackQuotes;
}) {
  const own = useCadouPackageQuotes();
  const q = quotes ?? own;
  return (
    <div className="cadou-packs">
      {PACKAGES.map((p) => (
        <CadouPackCard
          key={p.tier}
          tier={p.tier}
          selected={selected === p.tier}
          onSelect={onSelect ? () => onSelect(p.tier) : undefined}
          ctaHref={ctaHref}
          priceCents={q.byTier[p.tier]?.total}
          compareAtCents={q.byTier[p.tier]?.compareAtCents}
        />
      ))}
    </div>
  );
}
