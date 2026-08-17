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
  Ticker,
  NowPlaying,
} from '@/components/sections';
import { Generator } from '@/components/Generator';
import { Ic } from '@/components/icons';
import { useSite } from '@/lib/site-context';
import { formatPrice } from '@/lib/site-shared';
import { getPagePath } from '@/lib/page-slugs';
import { openDemosModal, useWizardReachedPackage } from '@/lib/wizard';

export default function HomePage() {
  const [playing, setPlaying] = useState<string | null>(null);
  const onPlay = (id: string) => setPlaying((p) => (p === id ? null : id));
  const reachedPackage = useWizardReachedPackage();
  const tHero = useTranslations('hero');
  const tHome = useTranslations('home');
  const tCommon = useTranslations('common');
  const site = useSite();
  const studio = getPagePath(site.locale, 'studio');
  const asculta = getPagePath(site.locale, 'asculta');

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
            {tHero('titleA')} <span className="gold-text">{tHero('titleHl')}</span>
            {tHero('titleB') && <><br />{tHero('titleB')}</>}
          </h1>
          <p className="sub-lead">
            {tHome('subLead')}
          </p>
          <div className="cta-row">
            <Link
              href={studio}
              className="btn btn-gold btn-lg"
              style={{ textDecoration: 'none' }}
              data-hint="true"
              data-hint-label="Studio"
            >
              {tCommon('ctaMakeManea', { price: formatPrice(site, site.basePriceCents) })}
            </Link>
            <button
              onClick={() => openDemosModal()}
              className="btn btn-ghost"
              style={{ textDecoration: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
              data-hint="true"
              data-hint-label="Ascultă demo"
            >
              <Ic.Play s={14} /> {tCommon('ctaListen')}
            </button>
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
            <div className="side-card">
              <h4>{tHome('side.whyTitle')}</h4>
              <ul style={{ paddingLeft: 18, fontSize: 13, color: 'rgba(255,245,220,0.7)', marginTop: 6 }}>
                <li style={{ marginBottom: 6 }}>{tHome('side.whyBullet1')}</li>
                <li style={{ marginBottom: 6 }}>{tHome('side.whyBullet2')}</li>
                <li style={{ marginBottom: 6 }}>{tHome('side.whyBullet3')}</li>
                <li>{tHome('side.whyBullet4')}</li>
              </ul>
            </div>

            <div className="side-card">
              <h4>{tHome('side.howTitle')}</h4>
              <ol style={{
                listStyle: 'none', padding: 0, margin: '10px 0 0',
                display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                {[1, 2, 3].map((step) => (
                  <li key={step} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{
                      flexShrink: 0,
                      width: 24, height: 24, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #ffe28a, #b07c1e)',
                      color: '#2a1a04', fontWeight: 900, fontSize: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{step}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold-2)' }}>
                        {tHome(`side.howStep${step}Title`)}
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(255,245,220,0.6)', lineHeight: 1.45, marginTop: 2 }}>
                        {tHome(`side.howStep${step}Body`)}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

          </aside>
        </section>

        <Ticker />

        {/* TOP — full width */}
        <section className="band" id="top">
          <div className="band-head">
            <div className="ek">{tHome('top.badge')}</div>
            <h2 className="gold-text">{tHome('top.title')}</h2>
            <p>{tHome('top.sub')}</p>
          </div>
          <Leaderboard />
        </section>

        {/* ȘMECHER — full width */}
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
            {reachedPackage ? (
              <button
                onClick={() => openDemosModal()}
                className="btn btn-ghost"
                style={{ textDecoration: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
              >
                {tHome('listen.viewAll')}
              </button>
            ) : (
              <Link href={asculta} className="btn btn-ghost" style={{ textDecoration: 'none' }}>
                {tHome('listen.viewAll')}
              </Link>
            )}
          </div>
        </section>
      </div>
    </SiteShell>
  );
}
