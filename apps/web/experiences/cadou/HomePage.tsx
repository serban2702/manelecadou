'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useSite } from '@/lib/site-context';
import { formatPrice } from '@/lib/site-shared';
import { getPagePath } from '@/lib/page-slugs';
import { CadouShell } from './Shell';
import { useCadouTestimonials } from './testimonials';
import { CadouHeroReaction } from './HeroReaction';
import { CadouReactionsRow } from './ReactionsRow';
import { CadouPackGrid, useCadouPackageQuotes } from './PackCard';
import { CadouStyleCard, useCadouStylePreview } from './StyleCard';
import { useExperienceCatalog } from '../use-experience-catalog';

/** Un rând din banda „Recent generate" (`cadou.home.recent`). */
type CadouRecent = { name: string; style: string };

function CadouStripeCancelBounce() {
  const search = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    if (search.get('paymentCanceled') !== '1') return;
    const genId = search.get('genId');
    const q = new URLSearchParams({ paymentCanceled: '1' });
    if (genId) q.set('genId', genId);
    router.replace(`/studio?${q.toString()}`);
  }, [search, router]);
  return null;
}

export default function CadouHomePage() {
  const site = useSite();
  const t = useTranslations('cadou.home');
  const { styles, testimonials } = useExperienceCatalog();
  const seedTesti = useCadouTestimonials();
  const stylePreview = useCadouStylePreview();
  const studio = getPagePath(site.locale, 'studio');
  const faqPath = getPagePath(site.locale, 'faq');
  const locale = site.locale;
  const testi = (testimonials == null
    ? seedTesti.map((item) => ({ ...item, stars: 5 }))
    : testimonials.map((item) => {
        const tr = item.i18n?.[locale] ?? {};
        return {
          id: item.id,
          quote: tr.quote ?? item.quote,
          name: tr.name ?? item.name,
          role: tr.role ?? item.role,
          stars: Math.max(0, Math.min(5, item.stars ?? 5)),
        };
      }));
  // Prețurile vin din quote-ul API (per-site), NU din constantele de cod: hero-ul
  // și grila de tarife împart același cache, deci nu pot arăta cifre diferite.
  const quotes = useCadouPackageQuotes();
  const basic = quotes.byTier.basic.total;
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  // Contorul depinde de ORA locală: pe server se calculează în UTC, în browser în
  // fusul vizitatorului — randat direct, cele două valori diferă și hidratarea
  // crapă. Îl calculăm doar după montare, deci exclusiv pe client.
  const [todayCount, setTodayCount] = useState<number | null>(null);
  useEffect(() => {
    setTodayCount(80 + new Date().getHours() * 3);
  }, []);

  const recent = (t.raw('recent') as CadouRecent[] | undefined) ?? [];
  const steps: Array<[string, string, string, string]> = [
    ['01', '📝', t('step1Title'), t('step1Text')],
    ['02', '✍️', t('step2Title'), t('step2Text')],
    ['03', '🎵', t('step3Title'), t('step3Text')],
    ['04', '🎧', t('step4Title'), t('step4Text')],
  ];
  const faqs = [
    { q: t('faq1Q', { name: site.name }), a: t('faq1A') },
    { q: t('faq2Q'), a: t('faq2A') },
    { q: t('faq3Q'), a: t('faq3A') },
    { q: t('faq4Q'), a: t('faq4A') },
  ];

  return (
    <CadouShell>
      <Suspense fallback={null}><CadouStripeCancelBounce /></Suspense>
      <div className="cadou-wrap">
        <section className="cadou-hero-card">
          <div
            className="cadou-hero-scene"
            style={{ backgroundImage: "url('/cadou/hero.jpg')" }}
            aria-hidden
          />
          <div className="cadou-hero-left">
            <div className="cadou-kicker">{t('heroKicker')}</div>
            <h1 className="cadou-gold-text">{t('heroTitle')}</h1>
            <p>{t('heroLead')}</p>
            <div className="cadou-hero-deal">
              <div className="cadou-hero-price">
                <b>{formatPrice(site, basic)}</b>
                <em>{t('heroDeal')}</em>
              </div>
              <div className="cadou-hero-remake">
                <span className="cadou-hero-remake-mark" aria-hidden>✓</span>
                <span>{t.rich('heroRemake', { b: (chunks) => <strong>{chunks}</strong> })}</span>
              </div>
            </div>
            <Link href={studio} className="cadou-cta">{t('heroCta')}</Link>
            {todayCount !== null && (
              <p className="cadou-hero-social">{t('heroSocial', { count: String(todayCount) })}</p>
            )}
          </div>
          <div className="cadou-hero-right">
            <CadouHeroReaction />
          </div>
        </section>

        <div className="cadou-stats">
          <div><b>{t('statSongsValue')}</b><span>{t('statSongs')}</span></div>
          <div><b>{t('statRatingValue')}</b><span>{t('statRating')}</span></div>
          <div><b>{t('statTimeValue')}</b><span>{t('statTime')}</span></div>
          <div><b>{t('statUsersValue')}</b><span>{t('statUsers')}</span></div>
        </div>

        <div className="cadou-recent" aria-hidden>
          <span className="cadou-recent-lab">{t('recentLabel')}</span>
          <div className="cadou-recent-mask">
            <div className="cadou-recent-track">
              {[...recent, ...recent].map((r, i) => (
                <span key={`${r.name}-${i}`} className="cadou-recent-chip">
                  {t('recentChip', { name: r.name, style: r.style })}
                </span>
              ))}
            </div>
          </div>
        </div>

        <section className="cadou-section cadou-panel" id="stiluri">
          <div className="cadou-kicker">{t('stylesKicker')}</div>
          <h2>{t('stylesTitle')}</h2>
          <p className="lead">{t('stylesLead')}</p>
          <div className="cadou-grid">
            {styles.map((s) => (
              <CadouStyleCard
                key={s.id}
                style={s}
                href={`${studio}?style=${encodeURIComponent(s.id)}`}
                playing={stylePreview.playing === `style-${s.id}`}
                onTogglePlay={() => stylePreview.toggle(s.id)}
              />
            ))}
          </div>
        </section>

        <CadouReactionsRow />

        <section className="cadou-section cadou-panel">
          <div className="cadou-kicker">{t('howKicker')}</div>
          <h2>{t('howTitle')}</h2>
          <p className="lead">{t('howLead')}</p>
          <div className="cadou-steps">
            {steps.map(([n, ic, title, text]) => (
              <div key={n} className="cadou-step">
                <div className="n">{n}</div>
                <div className="ic">{ic}</div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
          <p className="cadou-hint" style={{ textAlign: 'center', marginTop: 8 }}>{t('howHint')}</p>
          <div className="cadou-mid">
            <h3>{t('midTitle')}</h3>
            <p>{t('midLead')}</p>
            <Link href={studio} className="cadou-cta">{t('midCta')}</Link>
            <div className="cadou-pills" style={{ justifyContent: 'center' }}>
              <span className="cadou-pill dark">{t('midPillDeal', { price: formatPrice(site, basic) })}</span>
              <span className="cadou-pill dark">{t('midPillRemake')}</span>
            </div>
          </div>
        </section>

        <section className="cadou-reaction">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cadou/reaction.jpg" alt="" />
          <div>
            <div className="cadou-kicker">{t('reactionKicker')}</div>
            <h2>{t('reactionTitle')}</h2>
            <p>{t('reactionText')}</p>
            <Link href={studio} className="cadou-cta">{t('reactionCta')}</Link>
          </div>
        </section>

        {testi.length > 0 && (
        <section className="cadou-section cadou-panel">
          <div className="cadou-kicker">{t('testiKicker')}</div>
          <h2>{t('testiTitle')}</h2>
          <p className="lead">{t('testiLead')}</p>
          <div className="cadou-quotes">
            {testi.slice(0, 6).map((q) => (
              <article key={q.id} className="cadou-quote">
                <div className="stars">{'★'.repeat(q.stars)}</div>
                <p>{t('testiQuote', { text: q.quote })}</p>
                <div className="who">{q.role ? t('testiWho', { name: q.name, role: q.role }) : q.name}</div>
              </article>
            ))}
          </div>
        </section>
        )}

        <section className="cadou-section cadou-panel" id="tarife">
          <div className="cadou-kicker">{t('pricingKicker')}</div>
          <h2>{t('pricingTitle')}</h2>
          <p className="lead">{t('pricingLead')}</p>
          <CadouPackGrid ctaHref={studio} quotes={quotes} />
          <p className="cadou-hint" style={{ textAlign: 'center', marginTop: 16 }}>
            {t('pricingNote')}
          </p>
        </section>

        <section className="cadou-section cadou-panel">
          <div className="cadou-kicker">{t('faqKicker')}</div>
          <h2>{t('faqTitle')}</h2>
          <div className="cadou-faq">
            {faqs.map((item, i) => (
              <button
                key={item.q}
                type="button"
                className={`cadou-faq-item${openFaq === i ? ' open' : ''}`}
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <span className="q">{item.q}</span>
                {openFaq === i && <span className="a">{item.a}</span>}
              </button>
            ))}
          </div>
          <p style={{ textAlign: 'center', marginTop: 18 }}>
            <Link href={faqPath} className="cadou-ghost" style={{ textDecoration: 'none' }}>
              {t('faqAll')}
            </Link>
          </p>
        </section>
      </div>
    </CadouShell>
  );
}
