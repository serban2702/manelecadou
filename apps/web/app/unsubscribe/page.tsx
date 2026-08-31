'use client';

/**
 * Dezabonare de la emailurile de RECOVERY (comenzi neterminate).
 * Linkul vine din footer-ul emailurilor: /unsubscribe?token=<token unic>.
 *
 * NU dezabonează la click — cere confirmare activă: userul își tastează adresa
 * de email completă (afișăm doar varianta mascată, ex. s•••@gmail.com) și apasă
 * „Confirmă dezabonarea". Scope: DOAR recovery — emailurile tranzacționale
 * (plată, melodie gata) ajung în continuare.
 */

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:1501';

/** Cheia de traducere pentru etichetă; VALOAREA trimisă la API rămâne cea din
 *  stânga, în română, ca raportul de motive din admin să nu se spargă pe limbi. */
const REASONS = [
  { value: 'Am cumpărat deja', key: 'reasonBought' },
  { value: 'Prea multe emailuri', key: 'reasonTooMany' },
  { value: 'Nu mă mai interesează', key: 'reasonNotInterested' },
  { value: 'Altul', key: 'reasonOther' },
] as const;

interface UnsubInfo {
  ok: boolean;
  emailMasked: string;
  siteName: string;
  alreadyOptedOut?: boolean;
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <UnsubscribePageInner />
    </Suspense>
  );
}

function UnsubscribePageInner() {
  const t = useTranslations('unsubscribePage');
  const params = useSearchParams();
  const token = params.get('token');

  const [phase, setPhase] = useState<'loading' | 'invalid' | 'form' | 'submitting' | 'done'>('loading');
  const [info, setInfo] = useState<UnsubInfo | null>(null);
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setPhase('invalid');
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/recovery/unsubscribe/${encodeURIComponent(token)}`);
        if (!res.ok) {
          setPhase('invalid');
          return;
        }
        const data = (await res.json()) as UnsubInfo;
        setInfo(data);
        setPhase(data.alreadyOptedOut ? 'done' : 'form');
      } catch {
        setPhase('invalid');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setFormError(null);
    const typed = email.trim();
    if (!typed || !typed.includes('@')) {
      setFormError(t('errEmail'));
      return;
    }
    setPhase('submitting');
    try {
      const res = await fetch(`${API_URL}/api/recovery/unsubscribe/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: typed, reason: reason || undefined }),
      });
      if (res.ok) {
        setPhase('done');
        return;
      }
      const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
      const msg = Array.isArray(body?.message) ? body?.message[0] : body?.message;
      setFormError(
        msg || t('errMismatch'),
      );
      setPhase('form');
    } catch {
      setFormError(t('errNetwork'));
      setPhase('form');
    }
  }

  return (
    <main style={{ maxWidth: 460, margin: '60px auto', padding: 24 }}>
      <h1 className="gold-text serif" style={{ fontSize: 24, marginBottom: 12 }}>
        {t('title')}
      </h1>

      {phase === 'loading' && (
        <p style={{ fontSize: 13, color: 'rgba(255,245,220,0.6)' }}>{t('loading')}</p>
      )}

      {phase === 'invalid' && (
        <p style={{ color: 'var(--rose)', lineHeight: 1.6 }}>
          {t('invalid')}
        </p>
      )}

      {(phase === 'form' || phase === 'submitting') && info && (
        <>
          <p style={{ lineHeight: 1.6, marginBottom: 8 }}>
            {t.rich('question', {
              b: (c) => <b>{c}</b>,
              s: () => <b>{info.siteName}</b>,
            })}
          </p>
          <p style={{ lineHeight: 1.6, marginBottom: 18, color: 'rgba(255,245,220,0.7)' }}>
            {t.rich('confirmHint', {
              b: () => <b style={{ color: 'var(--gold-2)' }}>{info.emailMasked}</b>,
            })}
          </p>

          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="unsub-email">{t('emailLabel')}</label>
              <input
                id="unsub-email"
                type="email"
                autoComplete="email"
                placeholder="exemplu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={phase === 'submitting'}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="unsub-reason">{t('reasonLabel')}</label>
              <select
                id="unsub-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={phase === 'submitting'}
                style={{
                  width: '100%',
                  background: 'var(--bg-3)',
                  border: '1.5px solid var(--line)',
                  borderRadius: 8,
                  padding: '11px 12px',
                  color: 'var(--cream)',
                  fontSize: 14,
                  outline: 'none',
                }}
              >
                <option value="">{t('reasonPick')}</option>
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {t(r.key)}
                  </option>
                ))}
              </select>
            </div>

            {formError && (
              <p style={{ color: 'var(--rose)', fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
                {formError}
              </p>
            )}

            <button type="submit" className="btn btn-gold btn-block" disabled={phase === 'submitting'}>
              {phase === 'submitting' ? t('submitting') : t('submit')}
            </button>
          </form>
        </>
      )}

      {phase === 'done' && (
        <>
          <p style={{ lineHeight: 1.6, marginBottom: 10 }}>
            {t('doneTitle')}
          </p>
          <p style={{ lineHeight: 1.6, color: 'rgba(255,245,220,0.7)' }}>
            {t('doneSub')}
          </p>
        </>
      )}
    </main>
  );
}
