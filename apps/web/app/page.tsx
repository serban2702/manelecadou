'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SiteShell } from '@/components/SiteShell';
import {
  PriceStrip,
  QuickListen,
  Leaderboard,
  Testimonials,
  Smecher,
  Ticker,
  NowPlaying,
} from '@/components/sections';
import { Generator } from '@/components/Generator';
import { Ic } from '@/components/icons';

export default function HomePage() {
  const [playing, setPlaying] = useState<string | null>(null);
  const onPlay = (id: string) => setPlaying((p) => (p === id ? null : id));
  const tHero = useTranslations('hero');
  const tHome = useTranslations('home');
  const tCommon = useTranslations('common');

  return (
    <SiteShell>
      <div className="site-main">
        {/* HERO */}
        <section className="hero-wrap">
          <div className="hero-flag">{tHero('flag')}</div>

          {/* 1+1 GRATIS ribbon */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', borderRadius: 999,
            background: 'linear-gradient(135deg, var(--rose), var(--orange))',
            color: 'white', fontWeight: 800, fontSize: 12,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            boxShadow: '0 4px 14px rgba(255,45,126,0.35)',
            margin: '8px 0 4px',
          }}>
            {tHome('giftRibbon')}
          </div>

          <h1>
            {tHero('titleA')} <span className="gold-text">{tHero('titleHl')}</span><br />
            {tHero('titleB')}
          </h1>
          <p className="sub-lead">
            {tHome('subLead')}
            <br />
            <b style={{ color: 'var(--gold-2)' }}>{tHome('pay')}</b> · {tHome('warranty')}
          </p>
          <div className="cta-row">
            <Link
              href="/studio"
              className="btn btn-gold btn-lg"
              style={{ textDecoration: 'none' }}
              data-hint="true"
              data-hint-label="Studio"
            >
              {tCommon('ctaMakeManea')}
            </Link>
            <Link href="/asculta" className="btn btn-ghost" style={{ textDecoration: 'none' }}>
              <Ic.Play s={14} /> {tCommon('ctaListen')}
            </Link>
          </div>
          <div className="trust-row">
            <span>⭐ <span dangerouslySetInnerHTML={{ __html: tHome.raw('trust.reviews') as string }} /></span>
            <span>🎤 <span dangerouslySetInnerHTML={{ __html: tHome.raw('trust.count') as string }} /></span>
            <span>⚡ <span dangerouslySetInnerHTML={{ __html: tHome.raw('trust.speed') as string }} /></span>
            <span>🎁 <span dangerouslySetInnerHTML={{ __html: tHome.raw('trust.versions') as string }} /></span>
          </div>
        </section>

        {/* STUDIO grid: Generator + sidebar */}
        <section className="studio-grid">
          <div>
            <Generator playing={playing} onPlay={onPlay} />
          </div>
          <aside className="studio-side">
            <div className="side-card">
              <h4>{tHome('side.offer')}</h4>
              <PriceStrip />
            </div>
          </aside>
        </section>

        <Ticker />

        {/* TOP & ȘMECHER */}
        <section className="band" id="top">
          <div className="band-head">
            <div className="ek">{tHome('top.badge')}</div>
            <h2 className="gold-text">{tHome('top.title')}</h2>
            <p>{tHome('top.sub')}</p>
          </div>
          <div className="split-2">
            <div>
              <Leaderboard />
            </div>
            <div>
              <Smecher />
            </div>
          </div>
        </section>

        {/* TESTIMONIALS */}
        <section className="band">
          <div className="band-head">
            <div className="ek">{tHome('testi.badge')}</div>
            <h2 className="gold-text">{tHome('testi.title')}</h2>
          </div>
          <Testimonials />
        </section>

        {/* LISTEN */}
        <section className="band" id="asculta">
          <div className="band-head">
            <div className="ek">{tHome('listen.badge')}</div>
            <h2 className="gold-text">{tHome('listen.title')}</h2>
            <p>{tHome('listen.sub')}</p>
          </div>
          <QuickListen playing={playing} onPlay={onPlay} />
          {playing && playing.startsWith('d') && (
            <NowPlaying playing={playing} onClose={() => setPlaying(null)} />
          )}
          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <Link href="/asculta" className="btn btn-ghost" style={{ textDecoration: 'none' }}>
              {tHome('listen.viewAll')}
            </Link>
          </div>
        </section>
      </div>
    </SiteShell>
  );
}
