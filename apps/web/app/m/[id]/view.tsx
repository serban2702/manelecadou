'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api, ApiError, resolveMediaUrl, type GenerationDto } from '@/lib/api';
import { track } from '@/lib/tracking';
import { ManeaPlayer } from '@/components/ManeaPlayer';
import { STYLES, VOICES, OCC } from '@/lib/seed-data';
import { useSite } from '@/lib/site-context';
import { formatPrice } from '@/lib/site-shared';

export default function ShareGenerationView() {
  return (
    <Suspense fallback={null}>
      <ShareGenerationViewInner />
    </Suspense>
  );
}

function ShareGenerationViewInner() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const site = useSite();
  const [g, setG] = useState<GenerationDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const viewTrackedRef = useRef(false);
  const purchaseTrackedRef = useRef(false);

  async function refresh() {
    try {
      const fresh = await api.getGeneration(params.id);
      setG(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Eroare necunoscută');
    }
  }

  useEffect(() => {
    refresh();
  }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ViewContent — exact o dată pe încărcarea unei manele.
  useEffect(() => {
    if (!g || viewTrackedRef.current) return;
    viewTrackedRef.current = true;
    track('ViewContent', {
      content_id: g.id,
      content_name: `Manea pentru ${g.recipientName}`,
      content_type: 'product',
      value: site.basePriceCents / 100,
      currency: site.currency,
    });
  }, [g, site.basePriceCents, site.currency]);

  useEffect(() => {
    const paymentId = search.get('paymentId');
    const success = search.get('success');
    if (!paymentId || success !== '1' || unlocking) return;
    setUnlocking(true);
    (async () => {
      let paid: { amount: number; currency: string } | null = null;
      for (let i = 0; i < 10; i++) {
        try {
          const p = await api.getPayment(paymentId);
          if (p?.status === 'paid') {
            paid = { amount: p.amount, currency: p.currency };
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 1000));
      }
      try {
        await api.unlockGeneration(params.id, paymentId);
        await refresh();
        // CompletePayment — trimis o singură dată per paymentId.
        if (paid && !purchaseTrackedRef.current) {
          purchaseTrackedRef.current = true;
          track('Purchase', {
            content_id: params.id,
            content_name: 'Manea Cadou',
            content_type: 'product',
            value: paid.amount / 100,
            currency: paid.currency,
            // event_id = paymentId → dedup cu Events API server-side.
            event_id: paymentId,
          });
        }
      } catch (e) {
        setError('Nu am putut debloca după plată: ' + (e as Error).message);
      } finally {
        setUnlocking(false);
        window.history.replaceState({}, '', `/m/${params.id}`);
      }
    })();
  }, [search, params.id, unlocking]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <main style={{ padding: 40, textAlign: 'center' }}><p>{error}</p></main>;
  if (!g) return <main style={{ padding: 40, textAlign: 'center' }}><p className="ld">Se încarcă...</p></main>;

  const isPaid = g.type === 'full' || g.paidUnlocked;
  const styleNm = STYLES.find((s) => s.id === g.style)?.nm ?? g.style;
  const occNm = OCC.find((o) => o.id === g.occasion)?.nm ?? g.occasion;
  const voiceNm = VOICES.find((v) => v.id === g.voiceArtist)?.nm ?? g.voiceArtist;

  return (
    <main style={{ maxWidth: 600, margin: '40px auto', padding: 20 }}>
      <Link href="/manelele-mele" style={{
        display: 'inline-block', marginBottom: 14, fontSize: 12,
        color: 'var(--gold)', textDecoration: 'none',
      }}>
        ← Manelele mele
      </Link>

      <h1 className="gold-text serif" style={{ fontSize: 28 }}>"Pentru {g.recipientName}"</h1>
      <p className="ld" style={{ marginTop: 4 }}>
        {styleNm} · {occNm} · voce: {voiceNm}
      </p>
      {g.dedication && (
        <p className="ld" style={{ marginTop: 2, fontSize: 13 }}>de la {g.dedication}</p>
      )}
      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 11, padding: '3px 10px', borderRadius: 999,
          background: isPaid ? 'rgba(62,224,126,0.15)' : 'rgba(241,200,77,0.15)',
          color: isPaid ? '#bff5d2' : '#f1c84d', fontWeight: 600,
        }}>
          {isPaid ? '✓ Deblocată — versiuni complete (90s)' : '🔒 Demo — preview 30s'}
        </span>
        <span style={{
          fontSize: 11, padding: '3px 10px', borderRadius: 999,
          background: 'rgba(255,255,255,0.05)', color: 'rgba(255,245,220,0.6)',
        }}>
          Status: {g.status}
        </span>
      </div>

      {unlocking && (
        <div style={{
          marginTop: 14, padding: 12, borderRadius: 8,
          background: 'rgba(241,200,77,0.1)', border: '1px solid rgba(241,200,77,0.4)',
        }}>
          ✨ Confirmăm plata...
        </div>
      )}

      {/* Două versiuni audio. Fișierul demo (30s + fade-out) e generat fizic
          pe backend, deci playerul nu trebuie să mai trunchieze nimic în UI. */}
      {g.audioUrl && (
        <div style={{ marginTop: 16 }}>
          <ManeaPlayer
            audioUrl={resolveMediaUrl(g.audioUrl)!}
            title="Versiunea 1"
            subtitle={isPaid ? 'completă' : 'demo 30s'}
          />
        </div>
      )}
      {g.bonusAudioUrl && (
        <div style={{ marginTop: 12 }}>
          <ManeaPlayer
            audioUrl={resolveMediaUrl(g.bonusAudioUrl)!}
            title="Versiunea 2 🎁 (cadou)"
            subtitle={isPaid ? 'completă' : 'demo 30s'}
          />
        </div>
      )}

      {/* Paywall — doar dacă e demo neplătit + audio gata */}
      {!isPaid && g.status === 'succeeded' && g.audioUrl && (
        <PaywallSection generationId={g.id} onUnlocked={refresh} />
      )}

      {g.lyrics && (
        <details style={{ marginTop: 18 }}>
          <summary style={{ fontSize: 13, color: 'var(--gold)', cursor: 'pointer', fontWeight: 600 }}>
            📝 Vezi versurile
          </summary>
          <pre style={{
            whiteSpace: 'pre-wrap', marginTop: 10, color: 'var(--gold-2)',
            background: 'rgba(241,200,77,0.05)', padding: 12, borderRadius: 8,
            fontSize: 13, lineHeight: 1.6,
          }}>{g.lyrics}</pre>
        </details>
      )}
    </main>
  );
}

function PaywallSection({ generationId, onUnlocked }: { generationId: string; onUnlocked: () => void }) {
  const site = useSite();
  const fmt = (cents: number) => formatPrice(site, cents);
  const [submittingPay, setSubmittingPay] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState<{ code: string; discountCents: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [validatingPromo, setValidatingPromo] = useState(false);

  const basePrice = site.basePriceCents;
  const finalTotal = Math.max(0, basePrice - (promoApplied?.discountCents ?? 0));

  async function applyPromo() {
    if (!promoCode.trim()) return;
    setPromoError(null);
    setValidatingPromo(true);
    try {
      const r = await api.validatePromo(promoCode.trim(), undefined, basePrice);
      if (r.ok && r.appliedDiscountCents) {
        setPromoApplied({ code: promoCode.trim(), discountCents: r.appliedDiscountCents });
      } else {
        setPromoError(translatePromoReason(r.reason));
      }
    } catch {
      setPromoError('Eroare validare. Încearcă din nou.');
    } finally {
      setValidatingPromo(false);
    }
  }

  async function startCheckout() {
    setSubmittingPay(true);
    setPayError(null);
    try {
      track('InitiateCheckout', {
        content_id: generationId,
        content_name: 'Manea Cadou',
        content_type: 'product',
        value: site.basePriceCents / 100,
        currency: site.currency,
      });
      const { url } = await api.createCheckoutSession({
        generationId,
        promoCode: promoApplied?.code,
      });
      window.location.href = url;
    } catch (e) {
      setPayError(e instanceof ApiError ? e.message : 'Eroare la inițierea plății');
      setSubmittingPay(false);
    }
  }

  return (
    <div style={{
      marginTop: 22, padding: 16, borderRadius: 12,
      background: 'linear-gradient(135deg, rgba(90,13,24,0.4), rgba(40,12,18,0.4))',
      border: '1px solid var(--gold)',
    }}>
      <h3 style={{ marginTop: 0, fontSize: 18, color: 'var(--gold-2)' }}>
        🔓 Deblochează versiunile complete (90s × 2)
      </h3>
      <p className="ld" style={{ fontSize: 13, marginTop: 4 }}>
        Plătește o singură dată — primești pe email ambele versiuni complete, fără limita de 30s.
      </p>

      {promoApplied && (
        <div style={{
          marginTop: 10, padding: 10, borderRadius: 8,
          background: 'rgba(62,224,126,0.08)', border: '1px solid rgba(62,224,126,0.4)',
          fontSize: 13,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Preț</span>
            <span>{fmt(basePrice)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--green)', marginTop: 4 }}>
            <span>Promo <code>{promoApplied.code}</code></span>
            <span>−{fmt(promoApplied.discountCents)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.1)', fontWeight: 700 }}>
            <span>Total</span>
            <span className="gold-text">{fmt(finalTotal)}</span>
          </div>
        </div>
      )}

      <button
        onClick={startCheckout}
        disabled={submittingPay}
        className="btn"
        style={{
          marginTop: 12, width: '100%', padding: '12px 16px', fontWeight: 700,
          background: 'linear-gradient(180deg,#fff5cc 0%,#ffe28a 30%,#f1c84d 60%,#b07c1e 100%)',
          color: '#2a1a04', cursor: submittingPay ? 'wait' : 'pointer',
          opacity: submittingPay ? 0.7 : 1,
        }}
      >
        {submittingPay
          ? 'Te ducem la plată...'
          : promoApplied
            ? `🔒 Deblochează — ${fmt(finalTotal)}`
            : '🔒 Deblochează — vezi prețul la checkout'}
      </button>

      {payError && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#ff8888' }}>{payError}</div>
      )}

      <div style={{ marginTop: 10 }}>
        {!promoApplied ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              placeholder="Cod promo?"
              value={promoCode}
              onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoError(null); }}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 8,
                background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)',
                color: 'var(--gold-2)', fontFamily: 'inherit', fontSize: 13,
                fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
              }}
            />
            <button
              type="button"
              onClick={applyPromo}
              disabled={!promoCode.trim() || validatingPromo}
              className="btn btn-ghost btn-sm"
              style={{ padding: '8px 14px', fontSize: 13 }}
            >
              {validatingPromo ? '...' : 'Aplică'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setPromoApplied(null); setPromoCode(''); }}
            style={{
              background: 'transparent', border: 'none',
              color: 'rgba(255,245,220,0.5)', cursor: 'pointer', fontSize: 12,
              textDecoration: 'underline',
            }}
          >
            ✕ Elimină promo
          </button>
        )}
        {promoError && <div style={{ marginTop: 6, fontSize: 12, color: '#ff8888' }}>{promoError}</div>}
      </div>

      <PaywallGiftCode generationId={generationId} onUnlocked={onUnlocked} />
    </div>
  );
}

function translatePromoReason(reason: string | undefined): string {
  switch (reason) {
    case 'invalid': return 'Cod invalid sau dezactivat.';
    case 'expired': return 'Cod expirat.';
    case 'not_yet_valid': return 'Cod neactivat încă.';
    case 'used_up': return 'Cod folosit complet.';
    case 'wrong_email': return 'Cod restricționat la alt email.';
    case 'empty': return 'Introdu un cod.';
    default: return 'Cod nevalid.';
  }
}

function PaywallGiftCode({ generationId, onUnlocked }: { generationId: string; onUnlocked: () => void }) {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function apply() {
    if (!code.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.unlockGenerationWithGift(generationId, code.trim());
      onUnlocked();
    } catch (e) {
      const msg = e instanceof ApiError ? (e.body as { message?: string })?.message : (e as Error).message;
      const reason = msg || 'unknown';
      setError(
        reason === 'invalid' ? 'Cod invalid sau dezactivat.' :
        reason === 'expired' ? 'Cod expirat.' :
        reason === 'used_up' ? 'Cod folosit complet.' :
        'Cod nevalid.',
      );
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          marginTop: 10, padding: '10px 14px', width: '100%',
          background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(241,200,77,0.4)',
          borderRadius: 10, color: 'var(--gold-2)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        🎟️ Ai cod cadou? Apasă să-l folosești
      </button>
    );
  }

  return (
    <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          placeholder="GIFT-XXXXXXXX"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
          style={{
            flex: 1, padding: '8px 10px', borderRadius: 8,
            background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)',
            color: 'var(--gold-2)', fontFamily: 'ui-monospace, monospace', fontSize: 13,
          }}
        />
        <button
          onClick={apply}
          disabled={submitting || !code.trim()}
          className="btn btn-gold"
          style={{ padding: '8px 14px', fontSize: 13 }}
        >
          {submitting ? '...' : 'Aplică'}
        </button>
      </div>
      {error && <div style={{ marginTop: 6, fontSize: 12, color: '#ff8888' }}>{error}</div>}
    </div>
  );
}
