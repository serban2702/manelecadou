'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CreditCard,
  Loader2,
  MessageSquare,
  Music,
  ShoppingCart,
} from 'lucide-react';
import { NotificationPrefsApi, type ChatNotifyMode, type NotificationPrefs } from '@/lib/api';
import { useAsync } from '@/lib/hooks/use-async';
import { useToast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { PushNotificationsToggle } from '@/components/PushNotificationsToggle';
import { InternalTrafficCard } from './InternalTrafficCard';
import { cn } from '@/lib/cn';

/** Comutatoarele simple (pornit/oprit), în ordinea în care contează. */
const TOGGLES: Array<{
  key: Exclude<keyof NotificationPrefs, 'chatMode'>;
  icon: typeof CreditCard;
  title: string;
  description: string;
}> = [
  {
    key: 'payment',
    icon: CreditCard,
    title: 'Plăți',
    description: 'Când un client plătește sau când o plată eșuează.',
  },
  {
    key: 'finalStep',
    icon: ShoppingCart,
    title: 'A ajuns pe pasul de plată',
    description:
      'Când un vizitator ajunge pe ultimul pas al formularului, sau apasă pe Plătește în chat. Încă n-a dat banii — e momentul în care poți interveni.',
  },
  {
    key: 'stalledDelivery',
    icon: AlertTriangle,
    title: 'Plată fără livrare',
    description:
      'Client care a plătit dar nu primește nimic: generare nepornită, modificare blocată. Cere intervenție manuală.',
  },
  {
    key: 'generation',
    icon: Music,
    title: 'Generări',
    description: 'Comandă finalizată cu succes sau generare eșuată.',
  },
  {
    key: 'aiAlert',
    icon: Bot,
    title: 'Alerte de la Irina',
    description: 'Escaladări către om, limita de mesaje atinsă, bucle în conversație.',
  },
];

const CHAT_MODES: Array<{ value: ChatNotifyMode; title: string; description: string }> = [
  {
    value: 'all',
    title: 'Toate mesajele',
    description: 'Orice mesaj, de la orice client.',
  },
  {
    value: 'paid_only',
    title: 'Doar clienți care au plătit',
    description: 'Numai de la cine are cel puțin o comandă plătită.',
  },
  {
    value: 'off',
    title: 'Deloc',
    description: 'Niciun mesaj de chat pe telefon.',
  },
];

export default function NotificariPage() {
  const { toast } = useToast();
  const { data, loading, error } = useAsync(() => NotificationPrefsApi.mine(), []);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (data) setPrefs(data);
  }, [data]);

  /**
   * Salvează imediat la fiecare schimbare, fără buton de Save.
   *
   * Starea locală se aplică optimist, ca butonul să nu pară blocat; dacă
   * serverul refuză, o dăm înapoi — altfel ecranul ar arăta o preferință care
   * nu există, iar notificările n-ar corespunde cu ce vezi.
   */
  const patch = useCallback(
    async (change: Partial<NotificationPrefs>, label: string) => {
      if (!prefs) return;
      const previous = prefs;
      setPrefs({ ...prefs, ...change });
      setSaving(label);
      try {
        const saved = await NotificationPrefsApi.update(change);
        setPrefs(saved);
      } catch (e) {
        setPrefs(previous);
        toast({
          variant: 'destructive',
          title: 'Nu s-a putut salva',
          description: (e as Error).message,
        });
      } finally {
        setSaving(null);
      }
    },
    [prefs, toast],
  );

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Notificări"
        description="Ce îți ajunge pe telefon. Preferințele sunt ale tale — ceilalți admini își aleg separat."
        actions={<PushNotificationsToggle />}
      />

      {error && (
        <Card className="mb-4 border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">
            Nu s-au putut încărca preferințele: {error.message}
          </CardContent>
        </Card>
      )}

      {loading && !prefs && (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      )}

      {prefs && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4 text-primary" />
                Mesaje pe chat
              </CardTitle>
              <CardDescription>
                Sursa cu cel mai mare volum. Pe telefon, „toate mesajele" devine repede
                obositor — dar „deloc" înseamnă să ratezi un client care a dat deja bani.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {CHAT_MODES.map((mode) => {
                const active = prefs.chatMode === mode.value;
                return (
                  <button
                    key={mode.value}
                    type="button"
                    disabled={saving === 'chatMode'}
                    onClick={() => {
                      if (!active) void patch({ chatMode: mode.value }, 'chatMode');
                    }}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                      active
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-muted-foreground/40 hover:bg-secondary/50',
                      saving === 'chatMode' && 'opacity-60',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                        active ? 'border-primary' : 'border-muted-foreground/50',
                      )}
                      aria-hidden
                    >
                      {active && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{mode.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {mode.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Restul notificărilor</CardTitle>
              <CardDescription>Fiecare sursă separat.</CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {TOGGLES.map(({ key, icon: Icon, title, description }) => (
                <div key={key} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="mt-0.5 shrink-0 rounded-lg bg-secondary p-2">
                    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`pref-${key}`} className="block cursor-pointer text-sm font-medium">
                      {title}
                    </label>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {description}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 pt-0.5">
                    {saving === key && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    <Switch
                      id={`pref-${key}`}
                      checked={prefs[key]}
                      disabled={saving === key}
                      onCheckedChange={(v) => void patch({ [key]: v }, key)}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <InternalTrafficCard />

          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            Pe iPhone notificările merg doar din aplicația adăugată pe ecranul principal:
            deschide adminul în Safari, apasă Share → Add to Home Screen, apoi activează
            notificările din aplicația instalată. Pe Android și pe calculator funcționează
            direct din browser.
          </p>
        </div>
      )}
    </div>
  );
}
