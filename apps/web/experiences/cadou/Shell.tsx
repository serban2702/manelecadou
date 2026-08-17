'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ChatWidget } from '@/components/ChatWidget';
import { DemosPopup } from '@/components/DemosPopup';
import { useSite } from '@/lib/site-context';
import { getPagePath } from '@/lib/page-slugs';
import { openDemosModal, useWizardReachedPackage } from '@/lib/wizard';
import './theme.css';

export function CadouShell({ children }: { children: ReactNode }) {
  const site = useSite();
  const pathname = usePathname();
  const studio = getPagePath(site.locale, 'studio');
  const top = getPagePath(site.locale, 'top');
  const asculta = getPagePath(site.locale, 'asculta');
  const istoric = getPagePath(site.locale, 'istoric');
  const mine = getPagePath(site.locale, 'manelele-mele');
  const logo = site.brand?.logoUrl || '/logo-80.png';
  const [menuOpen, setMenuOpen] = useState(false);
  const [demosOpen, setDemosOpen] = useState(false);
  const reachedPackage = useWizardReachedPackage();

  useEffect(() => {
    const onOpen = () => setDemosOpen(true);
    window.addEventListener('mc:open_demos', onOpen);
    return () => window.removeEventListener('mc:open_demos', onOpen);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const ticker = [
    '💯 SATISFACȚIE GARANTATĂ — Regenerăm gratuit dacă nu îți place!',
    '🔥 1+1 GRATIS — A doua manea cadou!',
    '⚡ Gata în câteva minute — Livrare pe email!',
  ];
  const items = [...ticker, ...ticker];

  const nav = [
    { href: '/', label: 'ACASĂ', match: (p: string) => p === '/' },
    { href: studio, label: 'FĂ O MANEA', match: (p: string) => p.startsWith('/studio') },
    { href: asculta, label: 'ASCULTĂ', match: (p: string) => p.startsWith('/asculta'), listen: true },
    { href: top, label: 'TOP', match: (p: string) => p.startsWith('/top') },
    { href: istoric, label: 'ISTORIC', match: (p: string) => p.startsWith('/istoric') },
    { href: mine, label: 'MANELELE MELE', match: (p: string) => p.startsWith('/manelele-mele') },
  ];

  const renderLink = (n: (typeof nav)[number]) => {
    const active = n.match(pathname);
    if (n.listen && reachedPackage) {
      return (
        <a
          key={n.href}
          href={n.href}
          className={active ? 'is-active' : undefined}
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
      <Link key={n.href} href={n.href} className={active ? 'is-active' : undefined}>
        {n.label}
      </Link>
    );
  };

  return (
    <div className="cadou-root">
      <div className="cadou-ticker" aria-hidden>
        <div className="cadou-ticker-track">
          {items.map((t, i) => (
            <span key={i} style={{ padding: '0 28px' }}>{t}</span>
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
        <button
          type="button"
          className="cadou-burger"
          aria-label={menuOpen ? 'Închide meniul' : 'Deschide meniul'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </header>
      {menuOpen && <nav className="cadou-nav-mobile">{nav.map(renderLink)}</nav>}
      {children}
      <footer className="cadou-footer">
        <div>{site.name} · plăți prin Stripe</div>
        <div style={{ marginTop: 8 }}>
          <Link href={getPagePath(site.locale, 'terms')}>Termeni</Link>
          {' · '}
          <Link href={getPagePath(site.locale, 'privacy')}>Confidențialitate</Link>
          {' · '}
          <Link href={getPagePath(site.locale, 'cookies')}>Cookies</Link>
          {' · '}
          <Link href={getPagePath(site.locale, 'contact')}>Contact</Link>
          {' · '}
          <Link href={getPagePath(site.locale, 'faq')}>FAQ</Link>
        </div>
      </footer>
      <ChatWidget />
      <DemosPopup open={demosOpen} onClose={() => setDemosOpen(false)} />
    </div>
  );
}
