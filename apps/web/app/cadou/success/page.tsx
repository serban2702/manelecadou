'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { SiteShell } from '@/components/SiteShell';
import { track } from '@/lib/tracker';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:1501';

export default function GiftSuccessPage() {
  const params = useSearchParams();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const paymentId = params.get('paymentId');
    if (!paymentId) {
      track({ type: 'purchase_success', props: { source: 'gift', missingPaymentId: true } });
      return;
    }
    fetch(`${API_URL}/api/payments/${paymentId}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (!p) {
          track({ type: 'purchase_success', props: { source: 'gift', paymentId } });
          return;
        }
        track({
          type: 'purchase_success',
          valueCents: p.amount,
          currency: p.currency,
          props: {
            source: 'gift',
            paymentId,
            transaction_id: paymentId,
          },
        });
      })
      .catch(() => {
        track({ type: 'purchase_success', props: { source: 'gift', paymentId } });
      });
  }, [params]);

  return (
    <SiteShell hideStickyCta>
      <div className="inner-page" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 14 }}>🎁</div>
        <h1 className="gold-text">Plată confirmată!</h1>
        <p className="lead">
          Codul tău cadou e pe email. Verifică inbox-ul (sau folder-ul de spam) — îl primești în câteva secunde.
        </p>

        <div style={{ marginTop: 22, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/cadou/redeem" className="btn btn-gold" style={{ textDecoration: 'none' }}>
            🎟️ Folosește codul acum
          </Link>
          <Link href="/" className="btn btn-ghost" style={{ textDecoration: 'none' }}>
            Înapoi acasă
          </Link>
        </div>

        <p style={{ marginTop: 28, fontSize: 12, color: 'rgba(255,245,220,0.45)' }}>
          Codul e valabil 1 an de la data plății.
        </p>
      </div>
    </SiteShell>
  );
}
