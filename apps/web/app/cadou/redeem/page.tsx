'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SiteShell } from '@/components/SiteShell';
import { api } from '@/lib/api';

export default function RedeemPage() {
  return (
    <Suspense fallback={null}>
      <RedeemPageInner />
    </Suspense>
  );
}

function RedeemPageInner() {
  const search = useSearchParams();
  const [code, setCode] = useState('');
  const [validating, setValidating] = useState(false);
  const [valid, setValid] = useState<{ tier: string; usesLeft: number; validUntil: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redeemed, setRedeemed] = useState<{ usesLeft: number } | null>(null);

  useEffect(() => {
    const fromQuery = search.get('code');
    if (fromQuery) setCode(fromQuery.toUpperCase());
  }, [search]);

  async function validate() {
    setValidating(true);
    setError(null);
    setValid(null);
    setRedeemed(null);
    try {
      const r = await api.validateGift(code.trim());
      if (r.ok && r.tier && r.validUntil) {
        setValid({ tier: r.tier, usesLeft: r.usesLeft ?? 0, validUntil: r.validUntil });
      } else {
        setError(translateGiftReason(r.reason));
      }
    } catch {
      setError('Eroare validare. Încearcă din nou.');
    } finally {
      setValidating(false);
    }
  }

  async function redeem() {
    setValidating(true);
    setError(null);
    try {
      const r = await api.redeemGift(code.trim());
      if (r.ok && typeof r.usesLeft === 'number') {
        setRedeemed({ usesLeft: r.usesLeft });
      } else {
        setError(translateGiftReason(r.reason));
      }
    } catch {
      setError('Eroare la folosire. Încearcă din nou.');
    } finally {
      setValidating(false);
    }
  }

  return (
    <SiteShell hideStickyCta>
      <div className="inner-page">
        <h1 className="gold-text">🎟️ Folosește cod cadou</h1>
        <p className="lead">Introdu codul primit pe email sau prin SMS.</p>

        <div className="field">
          <label>Cod cadou</label>
          <input
            type="text"
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setValid(null); setError(null); }}
            placeholder="ex. GIFT-XXXXXXXX"
            style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '0.1em', textTransform: 'uppercase' }}
          />
        </div>

        {error && (
          <div style={{
            marginTop: 12, padding: 12, borderRadius: 8,
            background: 'rgba(255,45,126,0.12)', border: '1px solid rgba(255,45,126,0.4)',
            color: '#ffd6e6', fontSize: 13,
          }}>{error}</div>
        )}

        {valid && !redeemed && (
          <div style={{
            marginTop: 14, padding: 14, borderRadius: 10,
            background: 'rgba(62,224,126,0.08)', border: '1px solid rgba(62,224,126,0.4)',
          }}>
            <div style={{ color: 'var(--green)', fontWeight: 700, marginBottom: 6 }}>✓ Cod valid</div>
            <div style={{ fontSize: 13, color: 'rgba(255,245,220,0.8)' }}>
              Pachet: <b>{valid.tier === 'single' ? '1 manea' : valid.tier === 'pack3' ? '3 manele' : '10 manele'}</b>
              {' · '}
              <b>{valid.usesLeft}</b> utilizări rămase
              {' · '}
              valabil până la {new Date(valid.validUntil).toLocaleDateString('ro-RO')}
            </div>
          </div>
        )}

        {redeemed && (
          <div style={{
            marginTop: 14, padding: 18, borderRadius: 10,
            background: 'linear-gradient(135deg, rgba(62,224,126,0.15), rgba(62,224,126,0.05))',
            border: '2px solid var(--green)', textAlign: 'center',
          }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
            <h2 style={{ color: 'var(--green)', fontSize: 18, marginBottom: 6 }}>Cod folosit cu succes!</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,245,220,0.8)', marginBottom: 14 }}>
              Ai mai rămas cu <b>{redeemed.usesLeft}</b> utilizări. Treci la generator să-ți faci maneaua.
            </p>
            <Link href="/studio" className="btn btn-gold" style={{ textDecoration: 'none' }}>
              🎤 Fă maneaua acum
            </Link>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          {!redeemed && (
            <>
              <button
                className="btn btn-ghost"
                disabled={!code.trim() || validating}
                onClick={validate}
              >
                {validating ? 'Verificare...' : '🔍 Verifică'}
              </button>
              {valid && (
                <button
                  className="btn btn-gold"
                  disabled={validating}
                  onClick={redeem}
                  data-hint="true"
                  data-hint-label="Folosește cod"
                >
                  ✓ Folosește acum
                </button>
              )}
            </>
          )}
        </div>

        <p style={{ marginTop: 24, fontSize: 12, color: 'rgba(255,245,220,0.45)' }}>
          Nu ai cod? <Link href="/cadou" style={{ color: 'var(--gold)' }}>Cumpără unul aici</Link>.
        </p>
      </div>
    </SiteShell>
  );
}

function translateGiftReason(reason: string | undefined): string {
  switch (reason) {
    case 'invalid': return 'Cod invalid sau dezactivat.';
    case 'expired': return 'Cod expirat.';
    case 'used_up': return 'Acest cod a fost deja folosit complet.';
    default: return 'Cod nevalid.';
  }
}
