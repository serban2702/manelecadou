'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';
import { WebPushApi } from '@/lib/api';
import { Button } from '@/components/ui/button';

/** Convertește VAPID base64url → Uint8Array (cerut de PushSubscription.subscribe). */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'denied' }
  | { kind: 'unconfigured' } // server nu are VAPID
  | { kind: 'subscribed'; endpoint: string }
  | { kind: 'unsubscribed' }
  | { kind: 'working' }
  | { kind: 'error'; message: string };

export function PushNotificationsToggle({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const refresh = useCallback(async () => {
    setState({ kind: 'checking' });

    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState({ kind: 'unsupported', reason: 'Browser-ul nu suportă Web Push (try Chrome/Safari/Firefox).' });
      return;
    }
    if (Notification.permission === 'denied') {
      setState({ kind: 'denied' });
      return;
    }
    try {
      const { configured } = await WebPushApi.publicKey();
      if (!configured) {
        setState({ kind: 'unconfigured' });
        return;
      }
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        setState({ kind: 'subscribed', endpoint: sub.endpoint });
      } else {
        setState({ kind: 'unsubscribed' });
      }
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    // Înregistrează SW (idempotent — Chrome cache-uiește dacă e același)
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
      // Ascultă mesaje din SW (push-click → navighează în SPA)
      const onMsg = (ev: MessageEvent) => {
        if (ev.data?.type === 'push-click' && typeof ev.data.url === 'string') {
          window.location.href = ev.data.url;
        }
      };
      navigator.serviceWorker.addEventListener('message', onMsg);
      refresh();
      return () => navigator.serviceWorker.removeEventListener('message', onMsg);
    }
  }, [refresh]);

  const enable = async () => {
    setState({ kind: 'working' });
    try {
      // 1. Cere permisiune
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? { kind: 'denied' } : { kind: 'unsubscribed' });
        return;
      }
      // 2. Ia cheia publică VAPID din API
      const { publicKey, configured } = await WebPushApi.publicKey();
      if (!configured || !publicKey) {
        setState({ kind: 'unconfigured' });
        return;
      }
      // 3. Subscribe la PushManager
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      // 4. POST la API
      const r = await WebPushApi.subscribe({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent,
        label: `${detectDeviceLabel()} · ${new Date().toLocaleDateString()}`,
      });
      if (!r.ok) {
        setState({ kind: 'error', message: r.reason ?? 'Subscribe failed' });
        return;
      }
      setState({ kind: 'subscribed', endpoint: sub.endpoint });
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message });
    }
  };

  const disable = async () => {
    setState({ kind: 'working' });
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await WebPushApi.unsubscribe(sub.endpoint).catch(() => {});
        await sub.unsubscribe();
      }
      setState({ kind: 'unsubscribed' });
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message });
    }
  };

  const test = async () => {
    await WebPushApi.test().catch(() => {});
  };

  // RENDER
  if (state.kind === 'idle' || state.kind === 'checking') {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {!compact && 'Verific...'}
      </Button>
    );
  }
  if (state.kind === 'unsupported') {
    return (
      <Button variant="outline" size="sm" disabled title={state.reason}>
        <BellOff className="h-3.5 w-3.5" />
        {!compact && 'Nesuportat'}
      </Button>
    );
  }
  if (state.kind === 'denied') {
    return (
      <Button variant="outline" size="sm" disabled title="Permisiunea a fost refuzată. Reset din setări browser.">
        <BellOff className="h-3.5 w-3.5" />
        {!compact && 'Refuzat'}
      </Button>
    );
  }
  if (state.kind === 'unconfigured') {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        title="VAPID keys nu sunt setate. Mergi în /settings → Web Push și salvează cheile (generate cu: npx web-push generate-vapid-keys)"
      >
        <BellOff className="h-3.5 w-3.5" />
        {!compact && 'VAPID lipsește'}
      </Button>
    );
  }
  if (state.kind === 'working') {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {!compact && 'Se procesează...'}
      </Button>
    );
  }
  if (state.kind === 'subscribed') {
    return (
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={disable} title="Dezabonează acest device">
          <BellRing className="h-3.5 w-3.5 text-success" />
          {!compact && 'Notificări active'}
        </Button>
        {!compact && (
          <Button variant="ghost" size="sm" onClick={test} title="Trimite o notificare de test">
            Test
          </Button>
        )}
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <Button variant="outline" size="sm" onClick={enable} title={state.message}>
        <BellOff className="h-3.5 w-3.5 text-destructive" />
        {!compact && 'Eroare · retry'}
      </Button>
    );
  }
  // unsubscribed
  return (
    <Button variant="outline" size="sm" onClick={enable} title="Primește notificări push pentru mesaje noi">
      <Bell className="h-3.5 w-3.5" />
      {!compact && 'Activează notificări'}
    </Button>
  );
}

function detectDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Device';
  const ua = navigator.userAgent;
  let os = 'Device';
  if (/iPhone|iPad/.test(ua)) os = 'iOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Linux/.test(ua)) os = 'Linux';
  let br = 'Browser';
  if (/Edg\//.test(ua)) br = 'Edge';
  else if (/Chrome\//.test(ua)) br = 'Chrome';
  else if (/Firefox\//.test(ua)) br = 'Firefox';
  else if (/Safari\//.test(ua)) br = 'Safari';
  return `${os} · ${br}`;
}
