'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Cookie, Footer, LiveFeed } from './sections';
import { ChatWidget } from './ChatWidget';
import { RouletteWheel } from './RouletteWheel';
import { LangSwitcher } from './LangSwitcher';
import { MyGenerationsCounter } from './MyGenerationsCounter';
import { useSession } from '@/lib/providers';
import { useSite } from '@/lib/site-context';

export function SiteShell({ children, hideStickyCta }: { children: ReactNode; hideStickyCta?: boolean }) {
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
    { href: '/asculta', label: tNav('asculta') },
    { href: '/studio', label: tNav('studio') },
    { href: '/top', label: tNav('top') },
  ];

  useEffect(() => {
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
            <LangSwitcher />
            {session.user ? (
              <Link href="/cont" className="lang-btn" style={{ textDecoration: 'none' }}>
                👤 {session.user.email.split('@')[0]}
              </Link>
            ) : (
              <Link href="/login" className="lang-btn" style={{ textDecoration: 'none' }}>
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
      {cookieOpen && <Cookie onClose={closeCookie} />}

      {!hideStickyCta && (
        <div className="sticky-cta">
          <Link href="/studio" className="btn btn-gold btn-lg" style={{ textDecoration: 'none' }}>
            {tCommon('ctaMakeManea')}
          </Link>
        </div>
      )}
    </div>
  );
}
