'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const params = useSearchParams();
  const router = useRouter();
  const session = useSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setError('Token lipsă.');
      return;
    }
    (async () => {
      try {
        const { accessToken } = await api.consumeMagicLink(token);
        await session.setToken(accessToken);
        router.replace('/');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Eroare necunoscută');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ maxWidth: 420, margin: '60px auto', padding: 24 }}>
      <h1 className="gold-text serif" style={{ fontSize: 24, marginBottom: 12 }}>Te logăm...</h1>
      {error ? <p style={{ color: 'var(--rose)' }}>{error}</p> : <p className="ld">Un moment...</p>}
    </main>
  );
}
