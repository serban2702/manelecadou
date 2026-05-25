'use client';

/**
 * OpenReplay tracker (self-hosted).
 *
 * - Config-uri din `NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY` /
 *   `NEXT_PUBLIC_OPENREPLAY_INGEST_POINT`. Dacă PROJECT_KEY lipsește,
 *   componenta nu face nimic (no-op în dev / înainte ca instance-ul prod
 *   să fie up).
 * - Tracking-ul pornește din prima secundă, fără consent (decizie userului
 *   2026-05-25). Pentru câmpuri sensibile (parole, carduri) ne bazăm pe
 *   maskingul automat al SDK-ului (input[type=password]) + iframe-urile
 *   Stripe Elements (care sunt cross-origin → invizibile SDK-ului).
 * - Userul autentificat e identificat prin email (advanced matching cross
 *   sesiuni).
 * - Session ID e expus pe `window.__OR_SESSION_ID__` ca să poată fi
 *   atașat de `lib/api.ts` la fiecare request → backend-ul îl persistă
 *   pe `errors / payments / generations` pentru jump direct de la o eroare
 *   în Postgres la sesiunea video în OpenReplay.
 * - Network tracking e built-in în @openreplay/tracker v5+ (pluginul
 *   `@openreplay/tracker-fetch` e deprecated). Config-ul `network: {...}`
 *   activează capture-ul fetch/xhr.
 */

import { useEffect } from 'react';
import { getAccessToken } from '@/lib/api';

const PROJECT_KEY = process.env.NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY;
const INGEST_POINT = process.env.NEXT_PUBLIC_OPENREPLAY_INGEST_POINT;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

declare global {
  interface Window {
    __OR_SESSION_ID__?: string;
    __OR_TRACKER__?: unknown;
  }
}

export function OpenReplay() {
  useEffect(() => {
    if (!PROJECT_KEY) return;
    if (typeof window === 'undefined') return;
    if (window.__OR_TRACKER__) return;

    let cancelled = false;
    let identifyInterval: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        const [{ default: Tracker }, assistMod] = await Promise.all([
          import('@openreplay/tracker'),
          import('@openreplay/tracker-assist').catch(() => ({ default: null })),
        ]);
        if (cancelled) return;

        // Setări max-data: vrem să vedem cât mai mult.
        // - defaultInputMode: 0 (Plain) → toate inputurile vizibile by default
        // - obscureTextEmails / obscureTextNumbers: false → vede emailuri / cifre
        // - captureIFrames: true → înregistrează iframe-uri same-origin
        // - network.capturePayload: true → record body fetch/xhr
        // Câmpurile sensibile (parole) sunt mascate de SDK automat
        // (input[type=password]).
        // Stripe Elements (card) trăiesc în iframe cross-origin → invizibile by design.
        // Setări max-data: vrem să vedem cât mai mult.
        // - defaultInputMode: 0 (Plain) → toate inputurile vizibile by default
        // - obscureTextEmails / obscureTextNumbers: false → vede emailuri / cifre
        // - captureIFrames: true → înregistrează iframe-uri same-origin
        // - network.capturePayload: true → record body fetch/xhr
        // Câmpurile sensibile (parole) sunt mascate automat de SDK
        // (input[type=password]). Stripe Elements (carduri) trăiesc în iframe
        // cross-origin → invizibile by design.
        const tracker = new Tracker({
          projectKey: PROJECT_KEY,
          ingestPoint: INGEST_POINT || undefined,
          defaultInputMode: 0,
          obscureTextEmails: false,
          obscureTextNumbers: false,
          captureIFrames: true,
          captureResourceTimings: true,
          capturePerformance: true,
          network: {
            failuresOnly: false,
            sessionTokenHeader: false,
            captureInIframes: true,
            capturePayload: true,
            ignoreHeaders: [
              'authorization',
              'cookie',
              'set-cookie',
              'x-csrf-token',
            ],
          },
        });

        // Plugin Assist — activează live sessions + co-browse în dashboard
        // (`/co-browse` și pictograma `live` în lista de sesiuni). Comunicarea
        // pentru control remote e WebRTC peer-to-peer; pentru observation only
        // (no remote control), e WebSocket via containerul `assist` de pe Hetzner.
        // Config-uri default: live observation pornește la apel din dashboard,
        // userul vede un widget discret în colț doar dacă e cerută remote control.
        const assistPluginFactory = (assistMod as { default?: unknown }).default as
          | ((opts?: Record<string, unknown>) => unknown)
          | null;
        if (assistPluginFactory && typeof assistPluginFactory === 'function') {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any).use(
              assistPluginFactory({
                // Aspect: badge "Assist active" / call dialog folosesc culorile site-ului
                callConfirm: {
                  text: 'Echipa Manele Cadou cere să-ți vadă ecranul pentru a te ajuta. Accepți?',
                  style: { background: '#d4af37', color: '#0a0606' },
                  confirmBtn: { text: 'Accept', style: { background: '#0a0606', color: '#d4af37' } },
                  declineBtn: { text: 'Refuz', style: { background: 'transparent', color: '#d4af37', border: '1px solid #d4af37' } },
                },
              }),
            );
          } catch (err) {
            console.warn('[OpenReplay] Assist plugin failed', err);
          }
        }

        // NOTĂ: `tracker.start()` așteaptă `document.visibilityState === 'visible'`
        // înainte să facă POST la /ingest/v1/web/start. În tab-uri background
        // (sau headless Chrome cu visibility hidden) promise-ul rămâne suspended
        // până când documentul devine vizibil. E by design — evită sesiuni
        // inutile de la pre-render / background tabs.
        await tracker.start();

        const sid = (tracker as unknown as { getSessionID?: () => string }).getSessionID?.();
        if (sid) window.__OR_SESSION_ID__ = sid;
        window.__OR_TRACKER__ = tracker;

        // ---- IP attribution pentru anonymous users ----
        // Dashboard-ul OpenReplay arată „Anonymous User" pentru sesiunile fără
        // userID. Setăm `setUserID('ip:<X>')` ca fallback ca să distingi vizual
        // sesiunile diferite în lista din /sessions. Real user e suprapus mai
        // jos (după login).
        try {
          const res = await fetch(`${API_URL}/api/analytics/whoami`);
          if (res.ok) {
            const { ip } = (await res.json()) as { ip?: string | null };
            if (ip) {
              tracker.setUserID(`ip:${ip}`);
              tracker.setMetadata('ip', ip);
            }
          }
        } catch {
          /* ignore — whoami e best-effort */
        }

        // ---- User identification (poll login state) ----
        let lastToken: string | null = null;
        const identify = async () => {
          const token = getAccessToken();
          if (!token) {
            lastToken = null;
            return;
          }
          if (token === lastToken) return;
          try {
            const res = await fetch(`${API_URL}/api/users/me`, {
              headers: { Authorization: `Bearer ${token}` },
              credentials: 'include',
            });
            if (!res.ok) return;
            const me = (await res.json()) as { id?: string; email?: string };
            if (me?.email) {
              tracker.setUserID(me.email);
              if (me.id) tracker.setMetadata('userId', me.id);
              lastToken = token;
            }
          } catch {
            /* ignore */
          }
        };
        await identify();
        identifyInterval = setInterval(identify, 30_000);
      } catch (err) {
        console.warn('[OpenReplay] init failed', err);
      }
    })();

    return () => {
      cancelled = true;
      if (identifyInterval) clearInterval(identifyInterval);
    };
  }, []);

  return null;
}
