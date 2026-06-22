'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';

/** Erori de chunk stale: după un deploy, hash-urile chunk-urilor JS se schimbă,
 *  iar un tab deschis dinainte cere chunk-uri care nu mai există (404) → componenta
 *  nu se mai hidratează și pagina rămâne blocată (ex. „Se încarcă..." la infinit pe
 *  /m/[id]). Le detectăm și forțăm un reload o singură dată ca să luăm bundle-ul nou. */
function isChunkLoadError(message: string): boolean {
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i.test(
    message,
  );
}

/** Reîncarcă pagina o singură dată per fereastră de 20s (anti-buclă dacă chunk-ul
 *  chiar lipsește definitiv, nu doar e stale). Returnează true dacă a declanșat reload. */
function maybeReloadForStaleChunk(message: string): boolean {
  if (!isChunkLoadError(message)) return false;
  try {
    const KEY = 'mc_chunk_reload_ts';
    const now = Date.now();
    const last = Number(sessionStorage.getItem(KEY) || '0');
    if (now - last < 20_000) return false;
    sessionStorage.setItem(KEY, String(now));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

/**
 * Prinde erori globale (window.error + unhandledrejection) și le trimite
 * la endpoint-ul nostru intern /api/errors/client.
 *
 * Folosim un debounce simplu prin Set pentru a nu duplica aceeași eroare în 30s.
 */
export function ClientErrorReporter() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const recent = new Map<string, number>();
    const dedupeMs = 30_000;

    function shouldReport(key: string): boolean {
      const now = Date.now();
      const last = recent.get(key);
      if (last && now - last < dedupeMs) return false;
      recent.set(key, now);
      // cleanup old entries periodic
      if (recent.size > 50) {
        for (const [k, t] of recent) {
          if (now - t > dedupeMs) recent.delete(k);
        }
      }
      return true;
    }

    function send(message: string, stack?: string) {
      const path = window.location.pathname;
      const key = `${message}:${path}`;
      if (!shouldReport(key)) return;
      api.reportClientError({ message: message.slice(0, 200), stack: stack?.slice(0, 8000), path, level: 'error' }).catch(() => {});
    }

    function onError(ev: ErrorEvent) {
      const msg = ev.message ?? 'window error';
      send(msg, ev.error?.stack);
      maybeReloadForStaleChunk(msg);
    }
    function onRejection(ev: PromiseRejectionEvent) {
      const reason = ev.reason;
      const msg = typeof reason === 'string' ? reason : reason?.message ?? 'unhandled promise rejection';
      send(msg, reason?.stack);
      maybeReloadForStaleChunk(msg);
    }

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
