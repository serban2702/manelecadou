'use client';

import Link from 'next/link';
import { useSite } from '@/lib/site-context';
import { formatPrice } from '@/lib/site-shared';
import { getPagePath } from '@/lib/page-slugs';
import { STYLES, TESTI } from '@/lib/seed-data';
import { CadouShell } from './Shell';

export default function CadouHomePage() {
  const site = useSite();
  const studio = getPagePath(site.locale, 'studio');
  const styles = (site.styles && site.styles.length > 0) ? site.styles : STYLES;
  const testi = (site.testimonials && site.testimonials.length > 0)
    ? site.testimonials.map((t) => ({ id: t.id, quote: t.quote, name: t.name, role: t.role }))
    : TESTI.map((t, i) => ({ id: String(i), quote: t.q.replace(/^"|"$/g, ''), name: t.nm, role: t.rl }));
  const basic = site.basePriceCents;
  const compare = site.standardPriceCents && site.standardPriceCents > basic ? site.standardPriceCents : 0;
  const plus = site.experienceConfig?.items?.cadou?.packages?.plus;
  const premium = site.experienceConfig?.items?.cadou?.packages?.premium;
  const packs = [
    { name: 'Standard', price: basic, rec: false, features: site.experienceConfig?.items?.cadou?.packages?.basic?.features ?? ['Manea personalizată', 'Versuri pe gustul tău'] },
    { name: 'Plus', price: Math.round(basic * 1.67) || 4999, rec: true, features: plus?.features ?? ['Tot din Standard', 'Manea mai lungă', 'Poze social'] },
    { name: 'Premium', price: Math.round(basic * 3.33) || 9999, rec: false, features: premium?.features ?? ['Tot din Plus', 'Videoclip', 'Pagină premium'] },
  ];

  return (
    <CadouShell>
      <div className="cadou-wrap">
        <section className="cadou-hero">
          <div className="cadou-kicker">FĂ-ȚI MANEAUA MAI JOS</div>
          <h1>Creează-ți propria manea în 2 minute</h1>
          <p>Alege stilul, adaugă detaliile și generăm o manea unică — gata în câteva minute.</p>
          <Link href={studio} className="cadou-cta">Fă o manea</Link>
          <div style={{ marginTop: 12, fontSize: 14 }}>
            {compare > 0 && <span className="cadou-price-cut">{formatPrice(site, compare)}</span>}
            <span className="cadou-price-now">de la {formatPrice(site, basic)}</span>
            <span style={{ marginLeft: 10, color: 'var(--cadou-muted)' }}>· 100% satisfacție garantată</span>
          </div>
          <div className="cadou-stats">
            <div><b>100.000+</b><span>Manele generate</span></div>
            <div><b>4,9/5</b><span>Rating utilizatori</span></div>
            <div><b>2–5 min</b><span>Timp de generare</span></div>
          </div>
        </section>

        <section className="cadou-section" id="stiluri">
          <div className="cadou-kicker">Stiluri disponibile</div>
          <h2>Alege stilul tău</h2>
          <div className="cadou-grid">
            {styles.map((s) => (
              <Link key={s.id} href={`${studio}?style=${encodeURIComponent(s.id)}`} className="cadou-style">
                <span className="em">{s.em}</span>
                <span className="nm">{s.nm}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="cadou-section">
          <div className="cadou-kicker">Cum funcționează</div>
          <h2>În 4 pași simpli</h2>
          <div className="cadou-steps">
            {[
              ['01', 'Completează detaliile', 'Alege stilul și povestea'],
              ['02', 'Noi scriem versurile', 'Sau le dai tu pe ale tale'],
              ['03', 'Creăm muzica', 'Voce masculină sau feminină'],
              ['04', 'Primești maneaua', 'Descarci și o dai cadou'],
            ].map(([n, t, d]) => (
              <div key={n} className="cadou-step">
                <div className="n">{n}</div>
                <h3 style={{ margin: '8px 0 4px', fontSize: 16 }}>{t}</h3>
                <p style={{ margin: 0, color: 'var(--cadou-muted)', fontSize: 14 }}>{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="cadou-section">
          <div className="cadou-kicker">Ce spun utilizatorii</div>
          <h2>Reacții reale</h2>
          <div className="cadou-quotes">
            {testi.slice(0, 6).map((q) => (
              <article key={q.id} className="cadou-quote">
                <p>„{q.quote}”</p>
                <div className="who">★★★★★ · {q.name}{q.role ? ` · ${q.role}` : ''}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="cadou-section" id="tarife">
          <div className="cadou-kicker">Tarife</div>
          <h2>Prețuri simple, fără surprize</h2>
          <div className="cadou-packs">
            {packs.map((p) => (
              <div key={p.name} className={`cadou-pack${p.rec ? ' rec' : ''}`}>
                {p.rec && <div className="cadou-kicker" style={{ textAlign: 'left' }}>Recomandat</div>}
                <h3 style={{ margin: '6px 0' }}>{p.name}</h3>
                <div className="cadou-price-now" style={{ fontSize: 24 }}>{formatPrice(site, p.price)}</div>
                <ul style={{ paddingLeft: 18, color: 'var(--cadou-muted)', fontSize: 14 }}>
                  {p.features.map((f) => <li key={f}>{f}</li>)}
                </ul>
                <Link href={studio} className="cadou-cta" style={{ marginTop: 8, width: '100%' }}>Fă o manea</Link>
              </div>
            ))}
          </div>
        </section>
      </div>
    </CadouShell>
  );
}
