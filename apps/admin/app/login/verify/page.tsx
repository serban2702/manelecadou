'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Crown, Loader2 } from 'lucide-react';
import { AuthApi, AdminApi, setAdminToken } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';

export default function VerifyPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setError('Token lipsă.');
      return;
    }
    (async () => {
      try {
        const { accessToken } = await AuthApi.consumeMagicLink(token);
        setAdminToken(accessToken);
        try {
          await AdminApi.stats();
          router.replace('/');
        } catch {
          setAdminToken(null);
          setError('Email-ul tău nu are rol de admin. Setează ADMIN_EMAILS și încearcă din nou.');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Eroare necunoscută');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen grid place-items-center p-6 bg-gradient-to-br from-background via-background to-card">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-amber-300 flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
              <Crown className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-semibold">
              {error ? 'Autentificare eșuată' : 'Te logăm...'}
            </h1>
          </div>
          {error ? (
            <div className="mt-3 flex items-start gap-2 text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Un moment, verificăm token-ul...
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
