'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { SiteShell } from '@/components/SiteShell';

export default function LoginPage() {
  const t = useTranslations('loginPage');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.requestMagicLink(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errGeneric'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SiteShell hideStickyCta>
    <main style={{ maxWidth: 420, margin: '60px auto', padding: 24 }}>
      <h1 className="gold-text serif" style={{ fontSize: 28, marginBottom: 12 }}>{t('title')}</h1>
      <p className="ld" style={{ marginBottom: 20 }}>
        {t('sub')}
      </p>

      {sent ? (
        <div style={{
          padding: 16, borderRadius: 10, border: '1px solid var(--gold)',
          background: 'rgba(241,200,77,0.06)',
        }}>
          <p>{t('sentTo')} <b>{email}</b>. {t('sentHint')}</p>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label>{t('emailLabel')}</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
            />
          </div>
          {error && <div style={{ color: 'var(--rose)', fontSize: 13 }}>{error}</div>}
          <button className="btn btn-gold btn-lg" disabled={submitting}>
            {submitting ? t('submitting') : t('submit')}
          </button>
        </form>
      )}
    </main>
    </SiteShell>
  );
}
