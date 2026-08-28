'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { SiteShell } from '@/components/SiteShell';
import { ManeaPlayer } from '@/components/ManeaPlayer';
import { Ic } from '@/components/icons';
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
  const [playingId, setPlayingId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['top', period],
    queryFn: () => api.topList(period, 10),
    staleTime: 60_000,
  });

  // Sursa e dictată de admin (site.topSource). 'live' și 'template' aduc items
  // reale (cu audioUrl); 'seed' / niciun răspuns → lista demo hardcoded.
  const useReal = (data?.source === 'live' || data?.source === 'template') && !!data?.items;
  const rows: Array<{
    rk: number;
    id: string;
    ttl: string;
    by: string;
    pl: string;
    audioUrl?: string | null;
    startSec?: number;
    previewSec?: number;
  }> = useReal
    ? data!.items!
    : TOP.map((r) => ({
        rk: r.rk,
        id: String(r.rk),
        ttl: r.ttl,
        by: r.by,
        pl: r.pl,
        audioUrl: null,
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
              const canPlay = !!tr.audioUrl;
              const isPlaying = playingId === tr.id;
              // previewSec > 0 → limităm la startSec+previewSec; altfel melodia întreagă.
              const maxDurationSec =
                tr.previewSec && tr.previewSec > 0
                  ? (tr.startSec ?? 0) + tr.previewSec
                  : undefined;
              return (
                <div key={tr.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className={`lb-row ${tr.rk === 1 ? 'top1' : ''}`}>
                    <div className="rk">{tr.rk === 1 ? '👑' : `#${tr.rk}`}</div>
                    <div className="info" style={{ minWidth: 0 }}>
                      <div className="ttl">{tr.ttl}</div>
                      <div className="by">{tr.by} · {voiceTag}</div>
                    </div>
                    <div className="pl">▶ {tr.pl}</div>
                    {canPlay && (
                      <button
                        className="play-rk"
                        onClick={() => setPlayingId(isPlaying ? null : tr.id)}
                        aria-label={isPlaying ? 'Pause' : 'Play'}
                        style={{ cursor: 'pointer' }}
                      >
                        {isPlaying ? <Ic.Pause s={11} /> : <Ic.Play s={11} />}
                      </button>
                    )}
                  </div>
                  {isPlaying && canPlay && (
                    <div style={{ padding: '6px 10px 10px 44px' }}>
                      <ManeaPlayer
                        audioUrl={tr.audioUrl!}
                        compact
                        autoPlay
                        startSec={tr.startSec}
                        maxDurationSec={maxDurationSec}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            {useReal && rows.length === 0 && (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--fg-muted)' }}>
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
