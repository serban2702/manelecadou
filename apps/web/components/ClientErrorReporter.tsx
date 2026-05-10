'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';

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
      send(ev.message ?? 'window error', ev.error?.stack);
    }
    function onRejection(ev: PromiseRejectionEvent) {
      const reason = ev.reason;
      const msg = typeof reason === 'string' ? reason : reason?.message ?? 'unhandled promise rejection';
      send(msg, reason?.stack);
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
