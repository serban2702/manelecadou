'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getConsent, setConsent } from '@/lib/tracker';

export function CookieConsent() {
  const t = useTranslations('cookieBanner');
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dnt =
      navigator.doNotTrack === '1' ||
      (window as unknown as { doNotTrack?: string }).doNotTrack === '1';
    if (dnt) return;
    if (getConsent() === 'unknown') {
      const t = setTimeout(() => setShow(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  if (!show) return null;

  const accept = () => {
    setConsent('granted');
    setShow(false);
  };
  const decline = () => {
    setConsent('denied');
    setShow(false);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-2xl rounded-2xl border border-white/10 bg-black/90 p-4 text-sm text-white shadow-2xl backdrop-blur-md sm:inset-x-auto sm:right-4 sm:left-auto sm:bottom-4 sm:p-5"
    >
      <p className="mb-3 leading-relaxed">
        {t.rich('body', {
          a: (chunks) => (
            <a className="underline" href="/privacy" target="_blank" rel="noreferrer">
              {chunks}
            </a>
          ),
        })}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={accept}
          className="rounded-lg bg-yellow-400 px-4 py-2 font-semibold text-black transition hover:bg-yellow-300"
        >
          {t('accept')}
        </button>
        <button
          onClick={decline}
          className="rounded-lg border border-white/20 px-4 py-2 text-white/90 transition hover:bg-white/10"
        >
          {t('decline')}
        </button>
      </div>
    </div>
  );
}
