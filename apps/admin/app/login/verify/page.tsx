'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Crown, Loader2 } from 'lucide-react';
import { AuthApi, AdminApi, setAdminToken } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';

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
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = params.get('token');
    if (!t) setError('Token lipsă.');
    else setToken(t);
    // IMPORTANT: NU consumăm token-ul aici (la mount). Scaner-ele de securitate
    // ale email-ului randează pagina cu un browser headless și ar arde token-ul
    // single-use ÎNAINTE ca userul real să apuce să dea click → „Token already used".
    // Consumăm DOAR la apăsarea butonului (gest uman), pe care scaner-ele nu-l fac.
  }, [params]);

  async function confirm() {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { accessToken } = await AuthApi.consumeMagicLink(token);
      setAdminToken(accessToken);
      try {
        await AdminApi.stats();
        router.replace('/');
      } catch {
        setAdminToken(null);
        setError('Email-ul tău nu are rol de admin. Setează ADMIN_EMAILS și încearcă din nou.');
        setBusy(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Eroare necunoscută');
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center p-6 bg-gradient-to-br from-background via-background to-card">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-amber-300 flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
              <Crown className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-semibold">
              {error ? 'Autentificare eșuată' : 'Confirmă autentificarea'}
            </h1>
          </div>

          {error ? (
            <div className="mt-3 flex items-start gap-2 text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Apasă butonul ca să intri în panoul de admin. Confirmarea manuală
              împiedică scaner-ele de email să consume link-ul.
            </p>
          )}

          <button
            type="button"
            onClick={confirm}
            disabled={!token || busy}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Te logăm...
              </>
            ) : (
              <>
                <Crown className="h-4 w-4" />
                {error ? 'Încearcă din nou' : 'Intră în admin →'}
              </>
            )}
          </button>
        </CardContent>
      </Card>
    </main>
  );
}
