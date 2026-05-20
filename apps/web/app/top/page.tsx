'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { SiteShell } from '@/components/SiteShell';
import { TOP, VOICES } from '@/lib/seed-data';
import { api } from '@/lib/api';
import { useSite } from '@/lib/site-context';
import { getPagePath } from '@/lib/page-slugs';

type Period = 'week' | 'month' | 'all';

export default function TopPage() {
  const t = useTranslations('topPage');
  const tVoices = useTranslations('voices');
  const site = useSite();
  const studio = getPagePath(site.locale, 'studio');
  const [period, setPeriod] = useState<Period>('week');

  const { data } = useQuery({
    queryKey: ['top', period],
    queryFn: () => api.topList(period, 5),
    staleTime: 60_000,
  });

  // Sursa e dictată de admin (site.topSource). Până nu e răspuns / seed → demo.
  const useLive = data?.source === 'live' && data.items;
  const rows = useLive
    ? data!.items!
    : TOP.map((r) => ({
        rk: r.rk,
        id: String(r.rk),
        ttl: r.ttl,
        by: r.by,
        pl: r.pl,
        playsRaw: 0,
        voice: r.by,
        style: '',
        occasion: '',
      }));

  const PERIODS: { id: Period; label: string }[] = [
    { id: 'week', label: t('periodWeek') },
    { id: 'month', label: t('periodMonth') },
    { id: 'all', label: t('periodAll') },
  ];

  return (
    <SiteShell>
      <div className="site-main">
        <section className="hero-wrap" style={{ padding: '20px 0 6px' }}>
          <div className="hero-flag">👑 {t('flag')}</div>
          <h1 className="gold-text">{t('title')}</h1>
          <p className="sub-lead">{t('sub')}</p>
          <div className="cta-row" style={{ marginTop: 16 }}>
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={p.id === period ? 'btn btn-gold' : 'btn btn-ghost'}
                style={{ minWidth: 130 }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </section>

        <section className="band" style={{ marginTop: 24 }}>
          <div className="lb">
            {rows.map((tr) => {
              const voice = VOICES.find((v) =>
                tr.by.toLowerCase().includes(v.nm.toLowerCase().split(' ')[0].toLowerCase()),
              );
              const voiceTag = voice ? tVoices(`${voice.id}.tg`) : '—';
              return (
                <div key={tr.id} className={`lb-row ${tr.rk === 1 ? 'top1' : ''}`}>
                  <div className="rk">{tr.rk === 1 ? '👑' : `#${tr.rk}`}</div>
                  <div className="info">
                    <div className="ttl">{tr.ttl}</div>
                    <div className="by">{tr.by} · {voiceTag}</div>
                  </div>
                  <div className="pl">▶ {tr.pl}</div>
                </div>
              );
            })}
            {useLive && rows.length === 0 && (
              <div style={{ textAlign: 'center', padding: 24, color: 'rgba(255,245,220,0.5)' }}>
                {t('empty')}
              </div>
            )}
          </div>
        </section>

        <section className="band" style={{ textAlign: 'center' }}>
          <Link href={studio} className="btn btn-gold btn-lg" style={{ textDecoration: 'none' }}>
            🎤 {t('cta')}
          </Link>
        </section>
      </div>
    </SiteShell>
  );
}
