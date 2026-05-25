'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { SiteShell } from '@/components/SiteShell';

export default function CheckoutCancelPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutCancelInner />
    </Suspense>
  );
}

function CheckoutCancelInner() {
  const t = useTranslations('checkoutCancelPage');
  return (
    <SiteShell>
      <div className="inner-page" style={{ maxWidth: 560, margin: '60px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
        <h1 className="gold-text" style={{ marginTop: 0 }}>{t('title')}</h1>
        <p className="lead" style={{ marginTop: 8 }}>{t('lead')}</p>
        <p className="ld" style={{ marginTop: 14, fontSize: 14 }}>{t('detail')}</p>

        <div style={{ marginTop: 26, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/#generator" className="btn btn-gold">
            {t('retryCta')}
          </Link>
          <Link href="/contact" className="btn btn-ghost">
            {t('supportCta')}
          </Link>
        </div>
      </div>
    </SiteShell>
  );
}
