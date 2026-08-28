'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { SiteShell } from '@/components/SiteShell';
import { api } from '@/lib/api';
import { OCC, STYLES, VOICES } from '@/lib/seed-data';
import { useExperienceCatalog } from '@/experiences/use-experience-catalog';
import { ManeaPlayer } from '@/components/ManeaPlayer';
import { useSite } from '@/lib/site-context';
import { getPagePath } from '@/lib/page-slugs';

const PAGE_SIZE = 30;
const MAX_TOTAL = 300;

export default function IstoricPage() {
  const t = useTranslations('istoricPage');
  const tStyles = useTranslations('styles');
  const tOcc = useTranslations('occasions');
  const site = useSite();
  const catalog = useExperienceCatalog();
  const studio = getPagePath(site.locale, 'studio');
  const [styleId, setStyleId] = useState('');
  const [occasion, setOccasion] = useState('');
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['gallery', styleId, occasion, page],
    queryFn: () =>
      api.publicGenerations({
        style: styleId || undefined,
        occasion: occasion || undefined,
        period: 'all',
        sort: 'recent',
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    refetchInterval: 60_000,
  });

  function clearFilters() {
    setStyleId('');
    setOccasion('');
    setPage(0);
  }

  const totalRaw = data?.total ?? 0;
  const total = Math.min(totalRaw, MAX_TOTAL);
  const items = data?.items ?? [];
  const hasFilters = !!styleId || !!occasion;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Folosim i18n DOAR dacă cheia există efectiv. next-intl nu aruncă pe
  // MISSING_MESSAGE — face console.error și returnează fallback, deci try/catch
  // nu prinde nimic. Generations vechi pot avea style/occasion stocat ca nume
  // tradus (ex. "Modernă", "Zi de naștere") în loc de id stable — pe acelea
  // sărim peste i18n și folosim direct valoarea / seed-data.
  const styleLabel = (id: string) => {
    if ((tStyles as any).has?.(`${id}.nm`)) return tStyles(`${id}.nm` as any);
    return catalog.styles.find((s) => s.id === id)?.nm ?? STYLES.find((s) => s.id === id)?.nm ?? id;
  };
  const occLabel = (id: string) => {
    if ((tOcc as any).has?.(id)) return tOcc(id as any);
    return catalog.occasions.find((o) => o.id === id)?.nm ?? OCC.find((o) => o.id === id)?.nm ?? id;
  };

  return (
    <SiteShell>
      <div className="site-main">
        <section className="hero-wrap" style={{ padding: '20px 0 6px', textAlign: 'center' }}>
          <div className="hero-flag">{t('flag')}</div>
          <h1 className="gold-text">{t('title')}</h1>
          <p className="sub-lead">{t('sub')}</p>
        </section>

        <section className="band" style={{ marginTop: 20 }}>
          <div
            style={{
              display: 'grid',
              gap: 14,
              padding: 16,
              background: 'rgba(241,200,77,0.04)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              marginBottom: 18,
            }}
          >
            <FilterRow label={t('filterStyle')}>
              <Chip active={!styleId} onClick={() => { setStyleId(''); setPage(0); }}>{t('all')}</Chip>
              {catalog.styles.map((s) => (
                <Chip key={s.id} active={styleId === s.id} onClick={() => { setStyleId(s.id); setPage(0); }}>
                  {s.em} {styleLabel(s.id)}
                </Chip>
              ))}
            </FilterRow>
            <FilterRow label={t('filterOccasion')}>
              <Chip active={!occasion} onClick={() => { setOccasion(''); setPage(0); }}>{t('all')}</Chip>
              {catalog.occasions.map((o) => (
                <Chip key={o.id} active={occasion === o.id} onClick={() => { setOccasion(o.id); setPage(0); }}>
                  {o.em} {occLabel(o.id)}
                </Chip>
              ))}
            </FilterRow>
            {hasFilters && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={clearFilters}
                  style={{
                    background: 'transparent', border: '1px solid var(--line)',
                    color: 'var(--fg-muted)', padding: '6px 12px',
                    borderRadius: 999, fontSize: 12, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {t('reset')}
                </button>
              </div>
            )}
          </div>

          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 14 }}>
            {isLoading
              ? t('loading')
              : total === 1
                ? t('countOne', { count: total })
                : t('countMany', { count: total })}
          </div>

          {items.length === 0 && !isLoading ? (
            <div style={{ textAlign: 'center', padding: 36 }}>
              <p className="ld">{t('empty')}</p>
              <Link href={studio} className="btn btn-gold" style={{ textDecoration: 'none', marginTop: 14 }}>
                {t('emptyCta')}
              </Link>
            </div>
          ) : (
            <div className="demo-grid">
              {items.map((r) => {
                const voiceNm = VOICES.find((v) => v.id === r.voiceArtist)?.nm ?? r.voiceArtist;
                const styleNm = styleLabel(r.style);
                const occNm = occLabel(r.occasion);
                return (
                  <Link
                    href={`/m/${r.id}`}
                    key={r.id}
                    className="demo-card"
                    style={{ textDecoration: 'none', flexDirection: 'column', alignItems: 'stretch' }}
                  >
                    <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                      <div
                        style={{
                          width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
                          background:
                            'var(--avatar-fill)',
                          border: '1px solid var(--gold-deep)',
                        }}
                      />
                      <div className="meta" style={{ flex: 1, minWidth: 0 }}>
                        <div
                          className="nm"
                          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {t('for')} {r.recipientName}
                        </div>
                        {r.senderName && (
                          <div
                            className="by"
                            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            {t('from')} {r.senderName}
                          </div>
                        )}
                        <div
                          style={{
                            display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4,
                          }}
                        >
                          <span className="lb-tag">{styleNm}</span>
                          <span className="lb-tag">{occNm}</span>
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: 'var(--fg-muted)',
                            marginTop: 4,
                          }}
                        >
                          {voiceNm} · {t('plays', { count: (r as { viewCount?: number }).viewCount ?? 0 })}
                        </div>
                      </div>
                    </div>
                    {r.audioUrl && (
                      <div onClick={(e) => e.preventDefault()}>
                        <ManeaPlayer audioUrl={r.audioUrl} compact />
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}

          {total > PAGE_SIZE && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 24 }}>
              <button
                className="btn btn-ghost btn-sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                style={{ opacity: page === 0 ? 0.4 : 1 }}
              >
                {t('prev')}
              </button>
              <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--fg-muted)' }}>
                {t('pageOf', { current: page + 1, total: totalPages })}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                disabled={(page + 1) * PAGE_SIZE >= total}
                onClick={() => setPage((p) => p + 1)}
                style={{ opacity: (page + 1) * PAGE_SIZE >= total ? 0.4 : 1 }}
              >
                {t('next')}
              </button>
            </div>
          )}
        </section>

        <section className="band" style={{ textAlign: 'center' }}>
          <Link href={studio} className="btn btn-gold btn-lg" style={{ textDecoration: 'none' }}>
            {t('ctaMake')}
          </Link>
        </section>
      </div>
    </SiteShell>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="filter-lab"
        style={{
          fontSize: 11,
          color: 'var(--fg-muted)',
          marginBottom: 6,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={active ? 'filter-chip is-on' : 'filter-chip'}
      style={{
        padding: '6px 12px',
        fontSize: 12,
        fontWeight: 600,
        background: active ? 'var(--gold)' : 'var(--chip-bg, rgba(241,200,77,0.06))',
        color: active ? '#2a1a04' : 'var(--chip-fg, var(--cream))',
        border: `1px solid ${active ? 'var(--gold)' : 'var(--line)'}`,
        borderRadius: 999,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}
