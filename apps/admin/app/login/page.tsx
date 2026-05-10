'use client';

import { useState } from 'react';
import { Crown, Mail, MailCheck } from 'lucide-react';
import { AuthApi, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await AuthApi.requestMagicLink(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Eroare la trimitere.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center p-6 bg-gradient-to-br from-background via-background to-card">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-amber-300 text-primary-foreground shadow-xl shadow-primary/30 mb-3">
            <Crown className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Manele Cadou <span className="text-muted-foreground">·</span>{' '}
            <span className="gradient-text">Admin</span>
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Autentificare</CardTitle>
            <CardDescription>
              Doar email-urile din <code className="text-foreground">ADMIN_EMAILS</code> au acces.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="flex items-start gap-3 rounded-md border border-success/40 bg-success/5 p-4 text-sm">
                <MailCheck className="h-5 w-5 text-success mt-0.5 shrink-0" />
                <div>
                  Ți-am trimis un link la <b className="text-foreground">{email}</b>. Verifică inbox-ul (sau folder-ul Spam).
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email admin</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@manelecadou.ro"
                      className="pl-9"
                    />
                  </div>
                </div>
                {error && (
                  <div className="text-destructive text-sm rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
                    {error}
                  </div>
                )}
                <Button type="submit" loading={submitting} size="lg" className="w-full">
                  Trimite link de logare
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
