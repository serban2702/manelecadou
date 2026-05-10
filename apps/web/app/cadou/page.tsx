'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SiteShell } from '@/components/SiteShell';
import { Ic } from '@/components/icons';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/providers';
import { useSite } from '@/lib/site-context';
import { formatPrice } from '@/lib/site-config';

// Tier-urile: numele și descrierea sunt globale; prețurile vin din site (RON: 24.99/69/199; alte
// valute: scalate proporțional din site.giftPriceCents — vezi PaymentsService.tierPriceForSite).
const TIERS = [
  { id: 'single' as const, key: 'single', name: 'Manea Cadou', uses: 1, desc: '1 manea de 90s, 2 versiuni, livrare email', best: true },
  { id: 'pack3' as const, key: 'pack3', name: 'Pachet 3 manele', uses: 3, desc: '3 coduri, 3 ocazii diferite' },
  { id: 'pack10' as const, key: 'pack10', name: 'Pachet 10 manele', uses: 10, desc: 'Pentru organizatori, evenimente' },
];

const TIER_RATIOS = { single: 1, pack3: 69 / 24.99, pack10: 199 / 24.99 } as const;

export default function CadouPage() {
  const session = useSession();
  const site = useSite();
  const baseGiftCents = site.giftPriceCents || site.basePriceCents;
  const tierPrice = (id: 'single' | 'pack3' | 'pack10') =>
    formatPrice(site, Math.round(baseGiftCents * TIER_RATIOS[id]));
  const [openTier, setOpenTier] = useState<'single' | 'pack3' | 'pack10' | null>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy(tier: 'single' | 'pack3' | 'pack10') {
    const email = (session.user?.email || emailDraft).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Introdu un email valid — primești codul aici.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { url } = await api.purchaseGift(tier, email);
      window.location.href = url;
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 503
          ? 'Plățile sunt momentan dezactivate. Reîncearcă mai târziu.'
          : 'Eroare la deschiderea plății. Reîncearcă.',
      );
      setSubmitting(false);
    }
  }

  return (
    <SiteShell>
      <div className="site-main">
        <section className="hero-wrap" style={{ padding: '20px 0 6px' }}>
          <div className="hero-flag">🎁 Cadou pentru cineva</div>
          <h1 className="gold-text">Dă cuiva o manea cadou</h1>
          <p className="sub-lead">
            Cumperi tu codul. Primește el un cod pe email și își alege singur stilul, ocazia și vocea.
            <br />
            <b style={{ color: 'var(--gold-2)' }}>🛡️ Plată unică, fără abonament</b> · Codul e valabil 1 an.
          </p>
        </section>

        <section className="band" style={{ marginTop: 24 }}>
          <div className="band-head">
            <div className="ek">★ Pachete</div>
            <h2 className="gold-text">Alege cât de mărinimos ești</h2>
          </div>

          <div className="demo-grid">
            {TIERS.map((t) => (
              <div
                key={t.id}
                className="demo-card"
                style={{
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: 22,
                  border: t.best ? '2px solid var(--gold)' : '1px solid var(--line)',
                  position: 'relative',
                }}
              >
                {t.best && (
                  <span style={{
                    position: 'absolute', top: -10, right: 16,
                    background: 'linear-gradient(135deg,#ff2d7e,#ff7a1a)',
                    color: 'white', padding: '3px 10px', borderRadius: 999,
                    fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
                  }}>
                    CEL MAI POPULAR
                  </span>
                )}
                <div style={{ fontSize: 36, marginBottom: 10 }}>🎁</div>
                <div className="serif gold-text" style={{ fontSize: 18, fontWeight: 900, marginBottom: 4 }}>
                  {t.name}
                </div>
                <div className="gold-text" style={{ fontSize: 24, fontWeight: 900, marginBottom: 10 }}>
                  {tierPrice(t.id)}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,245,220,0.65)', marginBottom: 16 }}>
                  {t.desc}
                </div>
                <button
                  className="btn btn-rose btn-block"
                  onClick={() => setOpenTier(t.id === openTier ? null : t.id)}
                  data-hint={t.best ? 'true' : undefined}
                  data-hint-label="Cumpără cod"
                >
                  <Ic.Gift s={14} /> Cumpără cod
                </button>

                {openTier === t.id && (
                  <div style={{ width: '100%', marginTop: 12, padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)' }}>
                    <div className="field">
                      <label>📧 Email pentru livrare cod</label>
                      <input
                        type="email"
                        placeholder="tu@email.ro"
                        value={session.user?.email ?? emailDraft}
                        onChange={(e) => setEmailDraft(e.target.value)}
                        disabled={!!session.user}
                      />
                    </div>
                    {error && (
                      <div style={{ fontSize: 12, color: 'var(--rose)', marginTop: 6 }}>{error}</div>
                    )}
                    <button
                      className="btn btn-gold btn-block"
                      style={{ marginTop: 10 }}
                      disabled={submitting}
                      onClick={() => buy(t.id)}
                    >
                      {submitting ? 'Se deschide plata...' : `Plătește ${tierPrice(t.id)} cu cardul`}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="band">
          <div className="band-head">
            <div className="ek">📦 Cum funcționează</div>
            <h2 className="gold-text">3 pași simpli</h2>
          </div>
          <div className="split-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {[
              { n: '1', t: 'Plătește tu', d: 'Alegi pachetul, plătești cu cardul, primești cod cadou pe email.' },
              { n: '2', t: 'Trimite codul', d: 'Forward-ezi codul către cine vrei — prin SMS, WhatsApp, email.' },
              { n: '3', t: 'Își face singur', d: 'Persoana care primește, intră, introduce codul și își configurează maneaua.' },
            ].map((s) => (
              <div key={s.n} style={{ padding: 18, background: 'rgba(241,200,77,0.04)', border: '1px solid var(--line)', borderRadius: 12 }}>
                <div className="gold-text serif" style={{ fontSize: 32, fontWeight: 900, marginBottom: 8 }}>{s.n}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--gold-2)', marginBottom: 4 }}>{s.t}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,245,220,0.65)' }}>{s.d}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="band" style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: 14, fontSize: 13, color: 'rgba(255,245,220,0.6)' }}>
            Ai deja un cod cadou?
          </div>
          <Link href="/cadou/redeem" className="btn btn-ghost btn-lg" style={{ textDecoration: 'none' }}>
            🎟️ Folosește cod
          </Link>
        </section>

        <section className="band" style={{ textAlign: 'center', marginTop: 20 }}>
          <Link href="/studio" className="btn btn-gold" style={{ textDecoration: 'none' }}>
            Sau fă tu o manea acum →
          </Link>
        </section>
      </div>
    </SiteShell>
  );
}
