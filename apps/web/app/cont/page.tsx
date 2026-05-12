'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SiteShell } from '@/components/SiteShell';
import { confirmDialog } from '@/components/ConfirmDialog';
import { useSession } from '@/lib/providers';
import { api, ApiError } from '@/lib/api';

export default function ContPage() {
  const router = useRouter();
  const session = useSession();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState<'export' | 'delete' | null>(null);
  const [submitted, setSubmitted] = useState<'export' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session.ready && !session.user) {
      router.replace('/login');
    }
  }, [session.ready, session.user, router]);

  async function submit(type: 'export' | 'delete') {
    const ok = await confirmDialog(
      type === 'delete'
        ? {
            title: 'Ștergi contul?',
            description: 'Cererea de ștergere e ireversibilă odată procesată de echipă (în maxim 30 zile).',
            confirmText: 'Cere ștergere',
            variant: 'destructive',
          }
        : {
            title: 'Cere export al datelor?',
            description: 'Echipa noastră te va contacta pe email în maxim 30 zile cu arhiva datelor tale.',
            confirmText: 'Cere export',
          },
    );
    if (!ok) return;
    setSubmitting(type);
    setError(null);
    try {
      await api.gdprRequest(type, reason || undefined);
      setSubmitted(type);
      setReason('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Eroare. Încearcă din nou.');
    } finally {
      setSubmitting(null);
    }
  }

  if (!session.ready || !session.user) {
    return (
      <SiteShell hideStickyCta>
        <div className="inner-page"><p className="lead">Se încarcă...</p></div>
      </SiteShell>
    );
  }

  return (
    <SiteShell hideStickyCta>
      <div className="inner-page">
        <h1 className="gold-text">Contul tău</h1>
        <p className="lead">
          {session.user.email}
          {session.user.role === 'admin' && (
            <span style={{ marginLeft: 8, padding: '2px 8px', background: 'var(--gold)', color: '#2a1a04', borderRadius: 999, fontSize: 11, fontWeight: 800 }}>
              ADMIN
            </span>
          )}
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          <Link href="/studio" className="btn btn-gold" style={{ textDecoration: 'none' }}>
            🎤 Fă o manea
          </Link>
          <button
            className="btn btn-ghost"
            onClick={() => { session.logout(); router.replace('/'); }}
          >
            Logout
          </button>
        </div>

        <h2>📦 Datele tale (GDPR)</h2>
        <p>
          Ai dreptul, conform GDPR, să ceri exportul tuturor datelor noastre despre tine sau ștergerea
          completă a contului. Cererile sunt procesate manual de echipă în maxim 30 zile.
        </p>

        <div className="field" style={{ marginTop: 14 }}>
          <label>Motiv (opțional)</label>
          <textarea
            placeholder="ex. nu mai folosesc serviciul"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={400}
            style={{ minHeight: 80 }}
          />
        </div>

        {error && (
          <div style={{
            marginTop: 12, padding: 12, borderRadius: 8,
            background: 'rgba(255,45,126,0.12)', border: '1px solid rgba(255,45,126,0.4)',
            color: '#ffd6e6', fontSize: 13,
          }}>{error}</div>
        )}

        {submitted && (
          <div style={{
            marginTop: 12, padding: 12, borderRadius: 8,
            background: 'rgba(62,224,126,0.12)', border: '1px solid rgba(62,224,126,0.4)',
            color: '#bff5d2', fontSize: 13,
          }}>
            ✓ Cererea de {submitted === 'export' ? 'export' : 'ștergere'} a fost înregistrată.
            Te contactăm pe email în maxim 30 zile.
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          <button
            className="btn btn-ghost"
            disabled={!!submitting}
            onClick={() => submit('export')}
          >
            {submitting === 'export' ? 'Se trimite...' : '📥 Cere export date'}
          </button>
          <button
            className="btn btn-ghost"
            disabled={!!submitting}
            onClick={() => submit('delete')}
            style={{ borderColor: 'rgba(255,45,126,0.4)', color: '#ff6cb0' }}
          >
            {submitting === 'delete' ? 'Se trimite...' : '🗑️ Cere ștergere cont'}
          </button>
        </div>

        <p style={{ marginTop: 24, fontSize: 12, color: 'rgba(255,245,220,0.5)' }}>
          Detalii pe pagina <Link href="/confidentialitate" style={{ color: 'var(--gold)' }}>Confidențialitate</Link>.
        </p>
      </div>
    </SiteShell>
  );
}
