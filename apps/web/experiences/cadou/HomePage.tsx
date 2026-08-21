'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSite } from '@/lib/site-context';
import { formatPrice } from '@/lib/site-shared';
import { getPagePath } from '@/lib/page-slugs';
import { CadouShell } from './Shell';
import { CADOU_TESTI } from './testimonials';
import { CadouHeroReaction } from './HeroReaction';
import { CadouReactionsRow } from './ReactionsRow';
import { CadouPackGrid } from './PackCard';
import { CadouStyleCard, useCadouStylePreview } from './StyleCard';
import { useExperienceCatalog } from '../use-experience-catalog';
import { useCadouFromPrice } from './from-price';

const RECENT = [
  ['Ionuț', 'De jale'],
  ['Maria', 'De iubire'],
  ['Bogdan', 'De opulență'],
  ['Elena', 'Clasică de pahar'],
  ['Andrei', 'Cu trompetă'],
  ['Cristina', 'Orientală'],
  ['Florin', 'De pahar'],
  ['Roxana', 'Tallava'],
  ['Cătălin', 'Kuchek'],
  ['Simona', 'Trapanele'],
];

const FAQS = [
  {
    q: 'Ce este Manele Cadou?',
    a: 'Un generator de manele AI personalizate. Alegi stilul, spui povestea și primești o manea unică cu numele destinatarului, gata de ascultat și de dat cadou.',
  },
  {
    q: 'Cât durează generarea?',
    a: 'De obicei 2–5 minute. Îți trimitem maneaua pe email imediat ce e gata.',
  },
  {
    q: 'Ce se întâmplă dacă nu-mi place?',
    a: 'Ai o refacere GRATUITĂ dacă nu-ți place. Regenerăm până ești mulțumit.',
  },
  {
    q: 'Pot scrie eu versurile?',
    a: 'Da. La pasul Extra bifezi „Vreau să scriu propriile versuri” și le folosim literal.',
  },
];

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
  const { styles } = useExperienceCatalog();
  const stylePreview = useCadouStylePreview();
  const studio = getPagePath(site.locale, 'studio');
  const faqPath = getPagePath(site.locale, 'faq');
  const testi = CADOU_TESTI;
  const basic = useCadouFromPrice();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const todayCount = 80 + (new Date().getHours() * 3);

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
            <div className="cadou-kicker">Fă-ți maneaua mai jos!</div>
            <h1 className="cadou-gold-text">Creează-ți propria manea în 2 minute!</h1>
            <p>Alege stilul, adaugă detaliile și noi generăm o manea unică pentru tine — gata în câteva minute.</p>
            <div className="cadou-hero-deal">
              <div className="cadou-hero-price">
                <b>{formatPrice(site, basic)}</b>
                <em>1+1 GRATIS</em>
              </div>
              <div className="cadou-hero-remake">
                <span className="cadou-hero-remake-mark" aria-hidden>✓</span>
                <span>O refacere <strong>GRATUITĂ</strong> dacă nu-ți place</span>
              </div>
            </div>
            <Link href={studio} className="cadou-cta">Fă o manea!</Link>
            <p className="cadou-hero-social">🔥 {todayCount} manele create azi</p>
          </div>
          <div className="cadou-hero-right">
            <CadouHeroReaction />
          </div>
        </section>

        <div className="cadou-stats">
          <div><b>100.000+</b><span>Manele generate</span></div>
          <div><b>4,9/5</b><span>Rating utilizatori</span></div>
          <div><b>2–5 min</b><span>Timp de generare</span></div>
          <div><b>2.000+</b><span>Utilizatori activi</span></div>
        </div>

        <div className="cadou-recent" aria-hidden>
          <span className="cadou-recent-lab">Recent generate:</span>
          <div className="cadou-recent-mask">
            <div className="cadou-recent-track">
              {[...RECENT, ...RECENT].map(([name, style], i) => (
                <span key={`${name}-${i}`} className="cadou-recent-chip">▶ {name} · {style}</span>
              ))}
            </div>
          </div>
        </div>

        <section className="cadou-section cadou-panel" id="stiluri">
          <div className="cadou-kicker">Stiluri disponibile</div>
          <h2>Alege stilul tău</h2>
          <p className="lead">Fiecare stil are un suflet aparte. Alege-l pe cel care îți reprezintă povestea.</p>
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
          <div className="cadou-kicker">Cum funcționează</div>
          <h2>Cum funcționează generarea?</h2>
          <p className="lead">În doar 4 pași simpli, ai propria manea personalizată</p>
          <div className="cadou-steps">
            {[
              ['01', '📝', 'Completează detaliile', 'Alege stilul și titlul'],
              ['02', '✍️', 'Noi generăm versurile', 'Compunem versuri pe gustul tău'],
              ['03', '🎵', 'Creăm muzica', 'Compunem melodia perfectă'],
              ['04', '🎧', 'Primești maneaua', 'Descarcă și împărtășește'],
            ].map(([n, ic, t, d]) => (
              <div key={n} className="cadou-step">
                <div className="n">{n}</div>
                <div className="ic">{ic}</div>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
          <p className="cadou-hint" style={{ textAlign: 'center', marginTop: 8 }}>*sau ne dai tu versurile tale</p>
          <div className="cadou-mid">
            <h3>Gata să îți creezi maneaua?</h3>
            <p>Începe acum procesul de generare în doar câteva click-uri!</p>
            <Link href={studio} className="cadou-cta">Generează manea acum</Link>
            <div className="cadou-pills" style={{ justifyContent: 'center' }}>
              <span className="cadou-pill dark">{formatPrice(site, basic)} · 1+1 GRATIS</span>
              <span className="cadou-pill dark">O refacere GRATUITĂ dacă nu-ți place</span>
            </div>
          </div>
        </section>

        <section className="cadou-reaction">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cadou/reaction.jpg" alt="" />
          <div>
            <div className="cadou-kicker">Cadoul care nu se uită</div>
            <h2>Imaginează-ți reacția…</h2>
            <p>
              O manea personalizată pentru fratele tău, prietena ta, sau șeful de la petrecere.
              Cadoul pe care nu-l uită nimeni.
            </p>
            <Link href={studio} className="cadou-cta">Creează surpriza</Link>
          </div>
        </section>

        <section className="cadou-section cadou-panel">
          <div className="cadou-kicker">Ce spun utilizatorii</div>
          <h2>Reacții reale</h2>
          <p className="lead">Mii de fani care au primit maneaua perfectă.</p>
          <div className="cadou-quotes">
            {testi.slice(0, 6).map((q) => (
              <article key={q.id} className="cadou-quote">
                <div className="stars">★★★★★</div>
                <p>„{q.quote}”</p>
                <div className="who">{q.name}{q.role ? ` · ${q.role}` : ''}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="cadou-section cadou-panel" id="tarife">
          <div className="cadou-kicker">Tarife</div>
          <h2>Prețuri simple, fără surprize</h2>
          <p className="lead">O singură plată. Niciun abonament, nicio taxă ascunsă.</p>
          <CadouPackGrid ctaHref={studio} />
          <p className="cadou-hint" style={{ textAlign: 'center', marginTop: 16 }}>
            🔒 Stripe securizat · ⚡ Livrare instant · ✅ Garanție 30 zile
          </p>
        </section>

        <section className="cadou-section cadou-panel">
          <div className="cadou-kicker">Întrebări frecvente</div>
          <h2>Răspunsuri rapide</h2>
          <div className="cadou-faq">
            {FAQS.map((item, i) => (
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
              Vezi toate întrebările și răspunsurile →
            </Link>
          </p>
        </section>
      </div>
    </CadouShell>
  );
}
