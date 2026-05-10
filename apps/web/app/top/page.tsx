'use client';

import Link from 'next/link';
import { SiteShell } from '@/components/SiteShell';
import { TOP, VOICES } from '@/lib/seed-data';

const PERIODS = [
  { id: 'week', label: 'Săptămâna asta' },
  { id: 'month', label: 'Luna asta' },
  { id: 'all', label: 'Tot timpul' },
];

export default function TopPage() {
  return (
    <SiteShell>
      <div className="site-main">
        <section className="hero-wrap" style={{ padding: '20px 0 6px' }}>
          <div className="hero-flag">👑 Top România</div>
          <h1 className="gold-text">Cele mai tari manele</h1>
          <p className="sub-lead">
            Ce a băgat țara la AI. Ranking pe baza ascultărilor și a share-urilor.
          </p>
          <div className="cta-row" style={{ marginTop: 16 }}>
            {PERIODS.map((p, i) => (
              <button
                key={p.id}
                className={i === 0 ? 'btn btn-gold' : 'btn btn-ghost'}
                style={{ minWidth: 130 }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </section>

        <section className="band" style={{ marginTop: 24 }}>
          <div className="lb">
            {TOP.map((t) => {
              const voice = VOICES.find((v) => t.by.toLowerCase().includes(v.nm.toLowerCase().split(' ')[0].toLowerCase()));
              return (
                <div key={t.rk} className={`lb-row ${t.rk === 1 ? 'top1' : ''}`}>
                  <div className="rk">{t.rk === 1 ? '👑' : `#${t.rk}`}</div>
                  <div className="info">
                    <div className="ttl">{t.ttl}</div>
                    <div className="by">{t.by} · {voice?.tg ?? '—'}</div>
                  </div>
                  <div className="pl">▶ {t.pl}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="band" style={{ textAlign: 'center' }}>
          <Link href="/studio" className="btn btn-gold btn-lg" style={{ textDecoration: 'none' }}>
            🎤 Bagă și tu o manea în top
          </Link>
        </section>
      </div>
    </SiteShell>
  );
}
