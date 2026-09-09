'use client';

import { useEffect } from 'react';
import { requestSpaNavigation } from '@/lib/spa-router';

/**
 * Înregistrează `/sw.js` o singură dată, la nivel de aplicație, și tratează
 * click-ul pe o notificare push.
 *
 * Stă în root layout, nu în butonul de notificări: înainte, service worker-ul se
 * înregistra doar când se monta `PushNotificationsToggle`, adică numai dacă
 * deschideai `/chat`. Un admin care intra direct pe `/payments` rămânea fără SW,
 * deci fără push — tăcut, fiindcă butonul nici nu era pe ecran ca să arate ceva.
 *
 * Pe iOS mai contează un lucru: SW-ul trebuie să existe în contextul PWA-ului
 * instalat pe ecranul principal, care pornește pe `start_url` din manifest.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* Înregistrarea eșuează în dev pe http fără localhost. Nu e fatal. */
    });

    const onMessage = (ev: MessageEvent) => {
      if (ev.data?.type !== 'push-click' || typeof ev.data.url !== 'string') return;
      const url: string = ev.data.url;
      // Navigare SPA dacă se poate; altfel (ex. pe /login) încărcare clasică.
      if (!requestSpaNavigation(url)) window.location.href = url;
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  return null;
}
