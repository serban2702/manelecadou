'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SiteShell } from '@/components/SiteShell';
import { Generator } from '@/components/Generator';
import { PriceStrip } from '@/components/sections';

export default function StudioPage() {
  const [playing, setPlaying] = useState<string | null>(null);
  const onPlay = (id: string) => setPlaying((p) => (p === id ? null : id));
  const t = useTranslations('studio');

  return (
    <SiteShell>
      <div className="site-main">
        <section className="hero-wrap" style={{ padding: '20px 0 6px' }}>
          <div className="hero-flag">{t('heroFlag')}</div>
          <h1>{t('title')}</h1>
          <p className="sub-lead">
            {t('leadPart1')}
            <br />
            <b style={{ color: 'var(--gold-2)' }}>{t('giftBadge')}</b> · {t('noSubBadge')}
          </p>
        </section>

        <section className="studio-grid">
          <div>
            <Generator playing={playing} onPlay={onPlay} />
          </div>
          <aside className="studio-side">
            <div className="side-card">
              <h4>{t('sideOfferTitle')}</h4>
              <PriceStrip />
            </div>
            <div className="side-card">
              <h4>{t('whyTryTitle')}</h4>
              <ul style={{ paddingLeft: 18, fontSize: 13, color: 'rgba(255,245,220,0.7)' }}>
                <li style={{ marginBottom: 6 }}>{t('whyBullet1')}</li>
                <li style={{ marginBottom: 6 }}>{t('whyBullet2')}</li>
                <li style={{ marginBottom: 6 }}>{t('whyBullet3')}</li>
                <li style={{ marginBottom: 6 }}>{t('whyBullet4')}</li>
              </ul>
            </div>
          </aside>
        </section>
      </div>
    </SiteShell>
  );
}
