'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { SiteShell } from '@/components/SiteShell';
import { api, type SiteDemoDto } from '@/lib/api';
import { useSite } from '@/lib/site-context';
import { getPagePath } from '@/lib/page-slugs';
import { ManeaPlayer } from '@/components/ManeaPlayer';
import { useExperienceCatalog } from '@/experiences/use-experience-catalog';
import { useExperience } from '@/lib/experience-context';
// Lazy, ca `registry.ts`: importat static, codul + CSS-ul interfeței `cadou`
// (~62 kB de temă) ar intra în chunk-ul rutei și pe site-urile care rulează
// `classic`, unde ramura de mai jos nu se atinge niciodată.
const CadouListenPage = dynamic(() => import('@/experiences/cadou/ListenPage'));

const CATEGORY_KEYS = [
  'aniversare',
  'nunta',
  'botez',
  'cumetrie',
  'dragoste',
  'prietenie',
  'comemorare',
  'altele',
] as const;

export default function AsculaPage() {
  return (
    <Suspense fallback={null}>
      <AsculaPageGate />
    </Suspense>
  );
}

function AsculaPageGate() {
  const exp = useExperience();
  if (exp.slug === 'cadou') return <CadouListenPage />;
  return <AsculaPageInner />;
}

function AsculaPageInner() {
  const t = useTranslations('ascultaPage');
  const site = useSite();
  const studio = getPagePath(site.locale, 'studio');
  const istoricPath = getPagePath(site.locale, 'istoric');
  const [category, setCategory] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['site-demos'],
    queryFn: () => api.siteDemos(),
    staleTime: 60_000,
  });

  const { demoIds } = useExperienceCatalog();
  const items = useMemo(() => {
    const all = data?.items ?? [];
    if (!demoIds?.length) return all;
    return all.filter((d) => demoIds.includes(d.id));
  }, [data?.items, demoIds]);
  const filtered = useMemo(
    () => (category ? items.filter((d) => d.category === category) : items),
    [items, category],
  );

  // Categoriile arătate ca filtre: doar cele care apar efectiv în date — nu
  // umplem bara cu butoane goale când n-ai uploadat încă demo-uri din toate.
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((d) => set.add(d.category));
    return CATEGORY_KEYS.filter((c) => set.has(c));
  }, [items]);

  return (
    <SiteShell>
      <div className="site-main">
        <section
          className="hero-wrap"
          style={{ padding: '20px 0 6px', textAlign: 'center' }}
        >
          <div className="hero-flag">{t('flag')}</div>
          <h1 className="gold-text">{t('title')}</h1>
          <p className="sub-lead">{t('sub')}</p>
        </section>

        {availableCategories.length > 1 && (
          <section className="band" style={{ marginTop: 20 }}>
            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}
            >
              <CategoryChip
                active={!category}
                onClick={() => setCategory('')}
                label={t('all')}
              />
              {availableCategories.map((c) => (
                <CategoryChip
                  key={c}
                  active={category === c}
                  onClick={() => setCategory(c)}
                  label={t(`cat.${c}` as any)}
                />
              ))}
            </div>
          </section>
        )}

        <section className="band">
          {isLoading ? (
            <p className="ld" style={{ textAlign: 'center' }}>
              {t('loading')}
            </p>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 36 }}>
              <p className="ld">{t('empty')}</p>
              <Link
                href={studio}
                className="btn btn-gold"
                style={{ textDecoration: 'none', marginTop: 14 }}
              >
                {t('emptyCta')}
              </Link>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gap: 16,
                gridTemplateColumns:
                  'repeat(auto-fill, minmax(280px, 1fr))',
              }}
            >
              {filtered.map((d) => (
                <DemoCard key={d.id} demo={d} t={t} />
              ))}
            </div>
          )}
        </section>

        <section className="band" style={{ textAlign: 'center' }}>
          <Link
            href={studio}
            className="btn btn-gold btn-lg"
            style={{ textDecoration: 'none' }}
          >
            {t('ctaMake')}
          </Link>
          <div style={{ marginTop: 14 }}>
            <Link
              href={istoricPath}
              style={{
                fontSize: 13,
                color: 'rgba(255,245,220,0.6)',
                textDecoration: 'underline',
              }}
            >
              {t('viewHistoryLink')}
            </Link>
          </div>
        </section>
      </div>
    </SiteShell>
  );
}

function DemoCard({
  demo,
  t,
}: {
  demo: SiteDemoDto;
  t: ReturnType<typeof useTranslations>;
}) {
  const [showLyrics, setShowLyrics] = useState(false);
  const dedication = formatDedication(demo.fromName, demo.toName, t);

  return (
    <div className="demo-card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
        {demo.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={demo.thumbnailUrl}
            alt=""
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              flexShrink: 0,
              objectFit: 'cover',
              border: '1px solid var(--gold-deep)',
            }}
          />
        ) : (
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              flexShrink: 0,
              background:
                'radial-gradient(circle at 35% 35%, #2a1a04 6%, #1a0a0a 12%, #0a0606 24%, #2a1a04 64%)',
              border: '1px solid var(--gold-deep)',
            }}
          />
        )}
        <div className="meta" style={{ flex: 1, minWidth: 0 }}>
          <div
            className="nm"
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {demo.title}
          </div>
          {dedication && (
            <div
              className="by"
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {dedication}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            <span className="lb-tag">{t(`cat.${demo.category}` as any)}</span>
          </div>
        </div>
      </div>
      <ManeaPlayer audioUrl={demo.audioUrl} startSec={demo.previewStartSec} compact />
      {demo.lyrics && (
        <button
          onClick={() => setShowLyrics((v) => !v)}
          style={{
            marginTop: 8,
            background: 'transparent',
            border: '1px solid var(--line)',
            color: 'rgba(255,245,220,0.7)',
            padding: '5px 10px',
            borderRadius: 999,
            fontSize: 11,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {showLyrics ? t('hideLyrics') : t('showLyrics')}
        </button>
      )}
      {showLyrics && demo.lyrics && (
        <pre
          style={{
            marginTop: 8,
            padding: 12,
            background: 'rgba(241,200,77,0.04)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
            color: 'rgba(255,245,220,0.85)',
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {demo.lyrics}
        </pre>
      )}
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px',
        fontSize: 12,
        fontWeight: 600,
        background: active ? 'var(--gold)' : 'rgba(241,200,77,0.06)',
        color: active ? '#2a1a04' : 'var(--cream)',
        border: `1px solid ${active ? 'var(--gold)' : 'var(--line)'}`,
        borderRadius: 999,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );
}

function formatDedication(
  from: string | null,
  to: string | null,
  t: ReturnType<typeof useTranslations>,
): string {
  if (from && to) return t('dedicationFromTo', { from, to });
  if (to) return t('dedicationTo', { to });
  if (from) return t('dedicationFrom', { from });
  return '';
}
