'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Cookie, Footer, LiveFeed } from './sections';
import { ChatWidget } from './ChatWidget';
import { RouletteWheel } from './RouletteWheel';
import { LangSwitcher } from './LangSwitcher';
import { CountrySwitcher } from './CountrySwitcher';
import { MyGenerationsCounter } from './MyGenerationsCounter';
import { useSession } from '@/lib/providers';
import { useSite } from '@/lib/site-context';
import { formatPrice } from '@/lib/site-shared';
import { getPagePath } from '@/lib/page-slugs';

// `hideStickyCta` rămâne în signature pentru retrocompatibilitate cu paginile
// care îl pasează (legal, login, cont etc.), dar nu mai are efect — sticky
// CTA-ul a fost eliminat complet la cererea userului.
export function SiteShell({ children, hideStickyCta: _ignored }: { children: ReactNode; hideStickyCta?: boolean }) {
  const pathname = usePathname();
  const session = useSession();
  const tNav = useTranslations('nav');
  const tHeader = useTranslations('header');
  const tCommon = useTranslations('common');
  const site = useSite();
  const brandName = site.name;
  const logoSrc = site.brand?.logoUrl || '/logo-80.png';
  const t = useTranslations();
  const [cookieOpen, setCookieOpen] = useState(false);
  const [rouletteOpen, setRouletteOpen] = useState(false);

  const NAV = [
    { href: getPagePath(site.locale, 'asculta'), label: tNav('asculta') },
    { href: getPagePath(site.locale, 'studio'), label: tNav('studio') },
    { href: getPagePath(site.locale, 'istoric'), label: tNav('istoric') },
    { href: getPagePath(site.locale, 'top'), label: tNav('top') },
  ];

  // Banner-ul „🍪 Cookie-uri" e ascuns temporar (decizie 2026-05-26): marketing
  // cookies active din prima secundă, fără prompt. Pentru re-activare, scoate
  // `HIDE_COOKIE_BANNER = true` și restaurează `setCookieOpen(true)`.
  const HIDE_COOKIE_BANNER = true;

  useEffect(() => {
    if (HIDE_COOKIE_BANNER) {
      if (typeof window !== 'undefined' && !window.localStorage.getItem('mc_cookie_consent')) {
        window.localStorage.setItem('mc_cookie_consent', 'all');
      }
      return;
    }
    if (typeof window !== 'undefined' && !window.localStorage.getItem('mc_cookie_consent')) {
      setCookieOpen(true);
    }
  }, []);

  const closeCookie = (mode: 'rej' | 'all') => {
    setCookieOpen(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('mc_cookie_consent', mode);
    }
  };

  return (
    <div className="app site-shell">
      <div className="urgency">
        <span className="pulse"></span>
        <span dangerouslySetInnerHTML={{ __html: t.raw('urgency') as string }} />
      </div>
      <header className="hdr">
        <div className="hdr-inner">
          <Link href="/" className="brand" style={{ textDecoration: 'none' }}>
            <img
              src={logoSrc}
              alt={brandName}
              width={40}
              height={40}
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                border: '1.5px solid #b07c1e',
                objectFit: 'cover',
                flexShrink: 0,
              }}
            />
            <div>
              <div className="nm gold-text">{brandName}</div>
              <div className="sub">{site.brand?.tagline || tHeader('subBrand')}</div>
            </div>
          </Link>
          <nav className="hdr-nav">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={pathname === n.href ? 'act' : undefined}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="hdr-right" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <MyGenerationsCounter />
            {/* Atât CountrySwitcher (flag + .ro/.bg/...) cât și LangSwitcher
                (locale UI) sunt gate-uiate pe același flag din admin
                „Meniu selectare limbă". Userii vor unul SAU niciunul. */}
            {site.langSwitcherEnabled === true && <CountrySwitcher />}
            <LangSwitcher />
            {session.user ? (
              <Link href={getPagePath(site.locale, 'cont')} className="lang-btn" style={{ textDecoration: 'none' }}>
                👤 {session.user.email.split('@')[0]}
              </Link>
            ) : (
              <Link href={getPagePath(site.locale, 'login')} className="lang-btn" style={{ textDecoration: 'none' }}>
                {tNav('intra')}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main style={{ flex: 1 }}>{children}</main>

      <Footer />

      {/* Roulette trigger button — bottom-left floating */}
      <button
        onClick={() => setRouletteOpen(true)}
        title="Roata norocului"
        style={{
          position: 'fixed', left: 18, bottom: 18, zIndex: 50,
          width: 56, height: 56, borderRadius: '50%',
          background: 'radial-gradient(circle, #ff7a1a, #ff2d7e)',
          border: '2px solid #ffe28a',
          color: 'white', cursor: 'pointer', fontSize: 26,
          boxShadow: '0 8px 24px rgba(255,45,126,0.45)',
          animation: 'spin 8s linear infinite',
        }}
        data-hint="true"
        data-hint-label="Roata norocului"
      >🎡</button>

      <LiveFeed />
      <ChatWidget />
      {rouletteOpen && <RouletteWheel onClose={() => setRouletteOpen(false)} />}
      {!HIDE_COOKIE_BANNER && cookieOpen && <Cookie onClose={closeCookie} />}

      {/* Sticky CTA mobile scos la cererea userului — ocupa spațiu prețios
          pe ecranele mici și acoperea conținutul. CTA-ul rămâne în header
          + pe pagina principală. */}
    </div>
  );
}
