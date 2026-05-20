'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSite } from '@/lib/site-context';
import { siteUrl } from '@/lib/site-shared';
import { countryMetaFromLocale, flagSvgUrl } from '@/lib/country-meta';

interface CountryEntry {
  locale: string;
  domain: string;
  name: string;
}

export function CountrySwitcher() {
  const site = useSite();
  const [countries, setCountries] = useState<CountryEntry[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/public/site/countries`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: CountryEntry[]) => {
        if (!cancelled && Array.isArray(data)) setCountries(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const currentMeta = useMemo(() => countryMetaFromLocale(site.locale), [site.locale]);

  if (countries.length <= 1) return null;

  function pick(entry: CountryEntry) {
    setOpen(false);
    const target = siteUrl({ domain: entry.domain });
    if (typeof window !== 'undefined') {
      window.location.href = target;
    }
  }

  return (
    <div ref={ref} className="country-switcher">
      <button
        type="button"
        className="country-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={currentMeta.name}
        title={currentMeta.name}
      >
        <span className="country-flag" aria-hidden>
          <img
            src={flagSvgUrl(currentMeta.code)}
            alt=""
            width={20}
            height={15}
            loading="lazy"
            decoding="async"
          />
        </span>
        <span className="country-code">{currentMeta.code.toUpperCase()}</span>
        <span className="country-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <ul className="country-menu" role="listbox">
          {countries.map((entry) => {
            const meta = countryMetaFromLocale(entry.locale);
            const active = entry.domain === site.domain;
            return (
              <li key={entry.domain}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`country-option${active ? ' is-active' : ''}`}
                  onClick={() => pick(entry)}
                >
                  <span className="country-flag" aria-hidden>
                    <img
                      src={flagSvgUrl(meta.code)}
                      alt=""
                      width={24}
                      height={18}
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                  <span className="country-name">{meta.name}</span>
                  {active && <span className="country-dot" aria-hidden>●</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <style jsx>{`
        .country-switcher { position: relative; display: inline-flex; }
        .country-trigger {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 6px 10px; border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 215, 128, 0.25);
          color: #f4ecd8; font-size: 13px; font-weight: 600;
          cursor: pointer; transition: background 120ms ease, border-color 120ms ease;
        }
        .country-trigger:hover {
          background: rgba(255, 215, 128, 0.12);
          border-color: rgba(255, 215, 128, 0.45);
        }
        .country-flag {
          display: inline-flex; align-items: center; justify-content: center;
          width: 22px; height: 16px; overflow: hidden;
          border-radius: 3px; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
        }
        .country-flag img {
          display: block; width: 100%; height: 100%; object-fit: cover;
        }
        .country-code { letter-spacing: 0.04em; }
        .country-caret { font-size: 10px; opacity: 0.7; }
        .country-menu {
          position: absolute; right: 0; top: calc(100% + 8px);
          list-style: none; padding: 6px; margin: 0;
          background: linear-gradient(180deg, #1a140d 0%, #14100c 100%);
          border: 1px solid rgba(255, 215, 128, 0.3);
          border-radius: 14px; min-width: 220px; z-index: 80;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(176, 124, 30, 0.15);
          animation: country-menu-in 140ms ease-out;
        }
        @keyframes country-menu-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .country-option {
          width: 100%; display: flex; align-items: center; gap: 12px;
          padding: 9px 12px; border-radius: 10px; background: transparent;
          border: none; color: #f4ecd8; font-size: 14px; font-weight: 500;
          cursor: pointer; text-align: left;
          transition: background 120ms ease;
        }
        .country-option .country-flag {
          width: 26px; height: 19px;
        }
        .country-option:hover {
          background: rgba(255, 215, 128, 0.12);
        }
        .country-option.is-active {
          background: linear-gradient(90deg, rgba(176, 124, 30, 0.28), rgba(176, 124, 30, 0.08));
          color: #ffe6a8;
        }
        .country-name { flex: 1; }
        .country-dot {
          font-size: 8px;
          color: #ffd270;
        }
      `}</style>
    </div>
  );
}
