'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Countdown de ofertă „pe timp limitat" — per-vizitator, NU expiră niciodată.
 * Prima vizită fixează un deadline la +3 zile (persistat în localStorage cu
 * fallback cookie — robust și în in-app browsers, vezi lib/api.ts). Dacă
 * deadline-ul lipsește sau a trecut, se regenerează → fiecare vizitator vede
 * mereu ~3 zile rămase. Cronometrul scade în timp real (efect de urgență).
 */

const WINDOW_MS = 72 * 60 * 60 * 1000; // 3 zile
const KEY = 'mc_offer_deadline';

function readCookieNum(name: string): number | null {
  if (typeof document === 'undefined') return null;
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=(\\d+)`));
    return m ? parseInt(m[1], 10) : null;
  } catch {
    return null;
  }
}

function resolveDeadline(): number {
  const now = Date.now();
  let stored: number | null = null;
  try {
    const ls = window.localStorage.getItem(KEY);
    if (ls) stored = parseInt(ls, 10);
  } catch {
    /* storage blocat (in-app browser / private mode) */
  }
  if (stored == null) stored = readCookieNum(KEY);
  // Valid doar dacă e în viitor și în fereastra maximă (respinge valori aberante).
  if (stored && stored > now && stored - now <= WINDOW_MS + 60_000) return stored;
  const fresh = now + WINDOW_MS;
  try {
    window.localStorage.setItem(KEY, String(fresh));
  } catch {
    /* ignorăm */
  }
  try {
    document.cookie = `${KEY}=${fresh}; path=/; SameSite=Lax; max-age=${7 * 24 * 3600}`;
  } catch {
    /* ignorăm */
  }
  return fresh;
}

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

export default function OfferCountdown({ label }: { label?: string }) {
  const t = useTranslations('common');
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    let deadline = resolveDeadline();
    const tick = () => {
      let ms = deadline - Date.now();
      if (ms <= 0) {
        deadline = resolveDeadline();
        ms = deadline - Date.now();
      }
      setRemaining(ms);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Client-only: la SSR + prima randare returnăm null (evită hydration mismatch).
  if (remaining == null) return null;

  const { d, h, m, s } = parts(remaining);
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div
      style={{
        marginTop: 8,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        background: 'linear-gradient(135deg, rgba(214,47,63,0.18), rgba(176,30,46,0.10))',
        border: '1px solid rgba(214,47,63,0.45)',
        fontSize: 12,
        fontWeight: 800,
        color: '#ffd9b0',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden>⏳</span>
      <span>
        {label ?? t('endsIn')}{' '}
        <strong style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }}>
          {d}z {pad(h)}:{pad(m)}:{pad(s)}
        </strong>
      </span>
    </div>
  );
}
