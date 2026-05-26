'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useSession } from '@/lib/providers';

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyPageInner />
    </Suspense>
  );
}

function VerifyPageInner() {
  const t = useTranslations('loginPage');
  const params = useSearchParams();
  const router = useRouter();
  const session = useSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setError(t('verifyMissing'));
      return;
    }
    (async () => {
      try {
        const { accessToken } = await api.consumeMagicLink(token);
        await session.setToken(accessToken);
        router.replace('/');
      } catch (e) {
        setError(e instanceof Error ? e.message : t('verifyUnknown'));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ maxWidth: 420, margin: '60px auto', padding: 24 }}>
      <h1 className="gold-text serif" style={{ fontSize: 24, marginBottom: 12 }}>{t('verifyTitle')}</h1>
      {error ? (
        <>
          <p style={{ color: 'var(--rose)', marginBottom: 16 }}>{error}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="btn btn-gold"
            >
              Cere link nou
            </button>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="btn btn-ghost"
            >
              Înapoi acasă
            </button>
          </div>
        </>
      ) : (
        <p className="ld">{t('verifyHint')}</p>
      )}
    </main>
  );
}
