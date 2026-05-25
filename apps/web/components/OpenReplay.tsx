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
    // eslint-disable-next-line no-console
    console.log('[OpenReplay] mount, key set:', !!PROJECT_KEY, 'ingest:', INGEST_POINT);
    if (!PROJECT_KEY) return;
    if (typeof window === 'undefined') return;
    if (window.__OR_TRACKER__) return;

    let cancelled = false;
    let identifyInterval: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        console.log('[OpenReplay] before import');
        const { default: Tracker } = await import('@openreplay/tracker');
        console.log('[OpenReplay] import ok, Tracker=', typeof Tracker);
        if (cancelled) return;

        // Setări max-data: vrem să vedem cât mai mult.
        // - defaultInputMode: 0 (Plain) → toate inputurile vizibile by default
        // - obscureTextEmails / obscureTextNumbers: false → vede emailuri / cifre
        // - captureIFrames: true → înregistrează iframe-uri same-origin
        // - network.capturePayload: true → record body fetch/xhr
        // Câmpurile sensibile (parole) sunt mascate de SDK automat
        // (input[type=password]).
        // Stripe Elements (card) trăiesc în iframe cross-origin → invizibile by design.
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

        console.log('[OpenReplay] before start()');
        const startRes = await tracker.start();
        console.log('[OpenReplay] start returned:', startRes);

        const sid = (tracker as unknown as { getSessionID?: () => string }).getSessionID?.();
        if (sid) window.__OR_SESSION_ID__ = sid;
        window.__OR_TRACKER__ = tracker;

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
