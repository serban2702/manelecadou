'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { LOCALES, LOCALE_META, isLocale, type Locale } from '@/i18n/locales';
import { useSite } from '@/lib/site-context';

const COOKIE_NAME = 'NEXT_LOCALE';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function setLocaleCookie(locale: Locale) {
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE_NAME}=${locale}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

export function LangSwitcher() {
  const router = useRouter();
  const site = useSite();
  const current = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Strict opt-in via flag-ul din DB (admin /sites → „Meniu selectare limbă").
  // Default ascuns. Fără env fallback — un build cu NEXT_PUBLIC_SHOW_LANG_SWITCHER
  // greșit nu mai poate „învia" switcher-ul împotriva setării din admin.
  if (site.langSwitcherEnabled !== true) return null;

  const meta = LOCALE_META[isLocale(current) ? current : 'ro'];

  function pick(loc: Locale) {
    setLocaleCookie(loc);
    setOpen(false);
    void fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/locale`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: loc }),
    }).catch(() => {});
    router.refresh();
  }

  return (
    <div ref={ref} className="lang-switcher">
      <button
        type="button"
        className="lang-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={meta.name}
      >
        <span className="lang-flag" aria-hidden>{meta.flag}</span>
        <span className="lang-code">{current.toUpperCase()}</span>
        <span className="lang-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <ul className="lang-menu" role="listbox">
          {LOCALES.map((loc) => {
            const m = LOCALE_META[loc];
            const active = loc === current;
            return (
              <li key={loc}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`lang-option${active ? ' is-active' : ''}`}
                  onClick={() => pick(loc)}
                >
                  <span className="lang-flag" aria-hidden>{m.flag}</span>
                  <span className="lang-name">{m.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <style jsx>{`
        .lang-switcher { position: relative; display: inline-flex; }
        .lang-trigger {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 10px; border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 215, 128, 0.25);
          color: #f4ecd8; font-size: 13px; font-weight: 600;
          cursor: pointer; transition: background 120ms ease;
        }
        .lang-trigger:hover { background: rgba(255, 215, 128, 0.12); }
        .lang-flag { font-size: 16px; line-height: 1; }
        .lang-code { letter-spacing: 0.04em; }
        .lang-caret { font-size: 10px; opacity: 0.7; }
        .lang-menu {
          position: absolute; right: 0; top: calc(100% + 6px);
          list-style: none; padding: 4px; margin: 0;
          background: #14100c; border: 1px solid rgba(255, 215, 128, 0.25);
          border-radius: 12px; min-width: 180px; z-index: 80;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
        }
        .lang-option {
          width: 100%; display: flex; align-items: center; gap: 10px;
          padding: 8px 10px; border-radius: 8px; background: transparent;
          border: none; color: #f4ecd8; font-size: 14px; cursor: pointer;
          text-align: left;
        }
        .lang-option:hover { background: rgba(255, 215, 128, 0.1); }
        .lang-option.is-active { background: rgba(255, 215, 128, 0.18); color: #ffe6a8; }
      `}</style>
    </div>
  );
}
