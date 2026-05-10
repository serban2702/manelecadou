'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SiteShell } from '@/components/SiteShell';

const Q = [
  {
    q: 'Cât durează să primesc maneaua?',
    a: 'Demo-ul gratuit (30s) e gata în ~60-90 secunde. Maneaua completă (90s × 2 versiuni) e gata în ~2 minute după plată.',
  },
  {
    q: 'Vocile sunt reale? Sunt artiști?',
    a: 'Nu. Toate vocile sunt generate cu AI și sunt parodice. Numele artiștilor sunt fictive (Florinel de Aur, Adi Șampanie etc.). Nu reprezentăm artiști reali.',
  },
  {
    q: 'Pot folosi maneaua pe TikTok / Instagram?',
    a: 'Da. Maneaua e creată special pentru tine, ai drepturi de utilizare personală. Pentru utilizare comercială, contactează-ne.',
  },
  {
    q: 'De ce primesc 2 versiuni?',
    a: 'Studio-ul nostru AI generează 2 piese per request. Le primești pe amândouă cadou — alege-o pe cea care-ți place mai mult.',
  },
  {
    q: 'Pot să-mi scriu eu versurile?',
    a: 'Da! La pasul 3 din studio activezi opțiunea "Scrie tu versurile" și introduci textul. Studio-ul AI cântă exact ce-ai scris.',
  },
  {
    q: 'Ce e suprataxa de dedicație?',
    a: 'Dacă vrei să apară "dedic 1000 lei" în versuri, plătești suplimentar 10% din sumă, plafonat la 150 lei. Banii sunt doar simbolici, nu se transferă efectiv.',
  },
  {
    q: 'Cum primesc maneaua?',
    a: 'Pe email. Link-ul către manea + MP3-uri downloadable. Linkul rămâne activ pe pagina /m/:id.',
  },
  {
    q: 'Pot returna banii?',
    a: 'Conform legii, produsele digitale customizate nu se returnează după livrare. Dar dacă maneaua nu e ok tehnic (audio defect, versuri tăiate), facem alta gratis.',
  },
  {
    q: 'Cum cumpăr cod cadou?',
    a: 'Pe pagina /cadou alegi pachetul, plătești tu, primești cod pe email și îl dai cui vrei. Codul e valabil 1 an.',
  },
  {
    q: 'Cu ce plătesc?',
    a: 'Card bancar prin Stripe. În viitor: Apple Pay, Google Pay, Netopia (cardul românesc).',
  },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: Q.map((it) => ({
    '@type': 'Question',
    name: it.q,
    acceptedAnswer: { '@type': 'Answer', text: it.a },
  })),
};

export default function FaqPage() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <SiteShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="inner-page">
        <h1 className="gold-text">Întrebări frecvente</h1>
        <p className="lead">Tot ce vrei să știi înainte de a face prima manea.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Q.map((item, i) => (
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
          <p>Mai ai întrebări?</p>
          <Link href="/contact" className="btn btn-ghost" style={{ textDecoration: 'none', marginTop: 12 }}>
            Scrie-ne
          </Link>
        </div>
      </div>
    </SiteShell>
  );
}
