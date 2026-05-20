'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';

interface CounterResponse {
  count: number;
  scope: 'user' | 'guest' | 'anonymous';
}

/**
 * Mic counter în header care arată câte manele a generat utilizatorul curent.
 * Funcționează atât pentru guest (folosește mc_guest_id) cât și pentru user logat (JWT).
 * Refresh la 30s + la mount + când fereastra revine în focus.
 */
export function MyGenerationsCounter() {
  const t = useTranslations('myGensCounter');
  const [data, setData] = useState<CounterResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function fetchCount() {
      try {
        const r = await api.countMyGenerations();
        if (!cancelled) setData(r);
      } catch {
        /* silent — counter e secundar */
      }
    }

    fetchCount();
    interval = setInterval(fetchCount, 120_000);

    function onFocus() {
      fetchCount();
    }
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  if (!data || data.count === 0) return null;

  return (
    <Link
      href="/manelele-mele"
      className="my-gens-counter"
      title={t(data.count === 1 ? 'tooltipSingular' : 'tooltipPlural', { count: data.count })}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 999,
        background: 'linear-gradient(135deg, rgba(241,200,77,0.18), rgba(176,124,30,0.12))',
        border: '1px solid rgba(241,200,77,0.35)',
        color: '#f1c84d',
        fontSize: 13,
        fontWeight: 600,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        boxShadow: '0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
        transition: 'transform 0.15s ease, background 0.15s ease',
      }}
    >
      <span style={{ fontSize: 14 }}>🎵</span>
      <span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{data.count}</span>
        <span style={{ marginLeft: 6, opacity: 0.85, fontWeight: 500 }}>{t('label')}</span>
      </span>
    </Link>
  );
}
