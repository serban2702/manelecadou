'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SiteShell } from '@/components/SiteShell';

interface FaqItem { q: string; a: string }

export default function FaqPage() {
  const t = useTranslations('faqPage');
  const items = (t.raw('items') as FaqItem[]) ?? [];
  const [open, setOpen] = useState<number | null>(0);

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  };

  return (
    <SiteShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="inner-page">
        <h1 className="gold-text">{t('title')}</h1>
        <p className="lead">{t('lead')}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item, i) => (
            <div
              key={i}
              style={{
                background: 'rgba(241,200,77,0.04)',
                border: '1px solid var(--line)',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                style={{
                  width: '100%', padding: '14px 16px', textAlign: 'left',
                  background: 'transparent', border: 'none', color: 'var(--gold-2)',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontFamily: 'inherit',
                }}
              >
                {item.q}
                <span style={{ color: 'var(--gold)', fontSize: 18 }}>{open === i ? '−' : '+'}</span>
              </button>
              {open === i && (
                <div style={{
                  padding: '0 16px 14px', fontSize: 14,
                  color: 'rgba(255,245,220,0.75)', lineHeight: 1.6,
                }}>
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <p>{t('moreQuestions')}</p>
          <Link href="/contact" className="btn btn-ghost" style={{ textDecoration: 'none', marginTop: 12 }}>
            {t('writeUs')}
          </Link>
        </div>
      </div>
    </SiteShell>
  );
}
