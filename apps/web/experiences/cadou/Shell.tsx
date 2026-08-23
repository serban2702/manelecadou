'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChatWidget } from '@/components/ChatWidget';
import { DemosPopup } from '@/components/DemosPopup';
import { LangSwitcher } from '@/components/LangSwitcher';
import { CountrySwitcher } from '@/components/CountrySwitcher';
import { Cookie } from '@/components/sections';
import { useSite } from '@/lib/site-context';
import { formatPrice } from '@/lib/site-shared';
import { getPagePath } from '@/lib/page-slugs';
import { useCadouFromPrice } from './from-price';
import { openDemosModal, useWizardReachedPackage } from '@/lib/wizard';
import './theme.css';

// Identic cu `components/SiteShell.tsx` (decizie 2026-05-26): marketing cookies
// active din prima secundă, fără prompt. Pentru re-activare, scoate constanta
// și restaurează `setCookieOpen(true)`.
const HIDE_COOKIE_BANNER = true;

export function CadouShell({ children }: { children: ReactNode }) {
  const site = useSite();
  const t = useTranslations('cadou.shell');
  const pathname = usePathname();
  const studio = getPagePath(site.locale, 'studio');
  const top = getPagePath(site.locale, 'top');
  const asculta = getPagePath(site.locale, 'asculta');
  const istoric = getPagePath(site.locale, 'istoric');
  const mine = getPagePath(site.locale, 'manelele-mele');
  const logo = site.brand?.logoUrl || '/logo-80.png';
  const [menuOpen, setMenuOpen] = useState(false);
  const [demosOpen, setDemosOpen] = useState(false);
  const [cookieOpen, setCookieOpen] = useState(false);
  const reachedPackage = useWizardReachedPackage();
  const fromPrice = useCadouFromPrice();

  useEffect(() => {
    const onOpen = () => setDemosOpen(true);
    window.addEventListener('mc:open_demos', onOpen);
    return () => window.removeEventListener('mc:open_demos', onOpen);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (HIDE_COOKIE_BANNER) {
      if (!window.localStorage.getItem('mc_cookie_consent')) {
        window.localStorage.setItem('mc_cookie_consent', 'all');
      }
      return;
    }
    if (!window.localStorage.getItem('mc_cookie_consent')) setCookieOpen(true);
  }, []);

  const closeCookie = (mode: 'rej' | 'all') => {
    setCookieOpen(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('mc_cookie_consent', mode);
    }
  };

  const ticker = [t('ticker1'), t('ticker2'), t('ticker3')];
  const items = [...ticker, ...ticker];

  const nav: Array<{
    href: string;
    label: string;
    match: (p: string) => boolean;
    cta?: boolean;
    listen?: boolean;
  }> = [
    { href: '/', label: t('navHome'), match: (p: string) => p === '/' },
    { href: studio, label: t('navStudio'), match: under(studio), cta: true },
    { href: asculta, label: t('navListen'), match: under(asculta), listen: true },
    { href: top, label: t('navTop'), match: under(top) },
    { href: istoric, label: t('navHistory'), match: under(istoric) },
    { href: mine, label: t('navMine'), match: under(mine) },
  ];

  const renderLink = (n: (typeof nav)[number]) => {
    const active = n.match(pathname);
    const cls = [active ? 'is-active' : '', n.cta ? 'cadou-nav-cta' : ''].filter(Boolean).join(' ') || undefined;
    if (n.listen && reachedPackage) {
      return (
        <a
          key={n.href}
          href={n.href}
          className={cls}
          onClick={(e) => {
            e.preventDefault();
            openDemosModal();
            setMenuOpen(false);
          }}
        >
          {n.label}
        </a>
      );
    }
    return (
      <Link key={n.href} href={n.href} className={cls}>
        {n.label}
      </Link>
    );
  };
  const onStudio = pathname.startsWith(studio);
  const onSong = pathname.startsWith('/m/');
  const onMine = pathname.startsWith(mine);

  return (
    <div className="cadou-root">
      <div className="cadou-ticker" aria-hidden>
        <div className="cadou-ticker-track">
          {items.map((text, i) => (
            <span key={i} style={{ padding: '0 28px' }}>{text}</span>
          ))}
        </div>
      </div>
      <header className="cadou-header">
        <Link href="/" className="cadou-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="" />
          <span>{site.name}</span>
        </Link>
        <nav className="cadou-nav">{nav.map(renderLink)}</nav>
        <div className="cadou-header-tools">
          {/* Ambele switcher-e sunt gate-uite pe același flag din admin
              („Meniu selectare limbă"), la fel ca pe interfața classic. */}
          {site.langSwitcherEnabled === true && <CountrySwitcher />}
          <LangSwitcher />
        </div>
        <button
          type="button"
          className="cadou-burger"
          aria-label={menuOpen ? t('menuClose') : t('menuOpen')}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </header>
      {menuOpen && <nav className="cadou-nav-mobile">{nav.map(renderLink)}</nav>}
      <div className="cadou-main">{children}</div>
      <footer className="cadou-footer">
        <div>{t('payments', { name: site.name })}</div>
        <div style={{ marginTop: 8 }}>
          <Link href={getPagePath(site.locale, 'terms')}>{t('terms')}</Link>
          {' · '}
          <Link href={getPagePath(site.locale, 'privacy')}>{t('privacy')}</Link>
          {' · '}
          <Link href={getPagePath(site.locale, 'cookies')}>{t('cookies')}</Link>
          {' · '}
          <Link href={getPagePath(site.locale, 'contact')}>{t('contact')}</Link>
          {' · '}
          <Link href={getPagePath(site.locale, 'faq')}>{t('faq')}</Link>
        </div>
      </footer>
      {!onStudio && !onSong && !onMine && (
        <Link href={studio} className="cadou-sticky">
          <strong>{t('stickyCta')}</strong>
          <span>{t('stickyMeta', { price: formatPrice(site, fromPrice) })}</span>
        </Link>
      )}
      <ChatWidget />
      <DemosPopup open={demosOpen} onClose={() => setDemosOpen(false)} />
      {!HIDE_COOKIE_BANNER && cookieOpen && <Cookie onClose={closeCookie} />}
    </div>
  );
}

/**
 * Pe site-urile cu slug-uri localizate (`/slushai`, `/akouse`…) comparația cu
 * slug-ul canonic RO nu se potrivea niciodată, deci starea „activ" din meniu nu
 * se aprindea. Comparăm cu href-ul real al linkului.
 */
function under(href: string): (p: string) => boolean {
  return (p: string) => p === href || p.startsWith(`${href}/`);
}
