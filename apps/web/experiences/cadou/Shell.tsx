'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ChatWidget } from '@/components/ChatWidget';
import { DemosPopup } from '@/components/DemosPopup';
import { useSite } from '@/lib/site-context';
import { getPagePath } from '@/lib/page-slugs';
import './theme.css';

export function CadouShell({ children }: { children: ReactNode }) {
  const site = useSite();
  const pathname = usePathname();
  const studio = getPagePath(site.locale, 'studio');
  const top = getPagePath(site.locale, 'top');
  const logo = site.brand?.logoUrl || '/logo-80.png';
  const ticker = ['💯 SATISFACȚIE GARANTATĂ — Regenerăm gratuit dacă nu îți place!', '🔥 1+1 GRATIS — A doua manea cadou!', '⚡ Gata în câteva minute — Livrare pe email!'];
  const items = [...ticker, ...ticker];

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
        <nav className="cadou-nav">
          <Link href="/" className={pathname === '/' ? 'is-active' : ''}>ACASĂ</Link>
          <Link href={studio} className={pathname.startsWith('/studio') ? 'is-active' : ''}>FĂ O MANEA</Link>
          <Link href={top}>TOP</Link>
          <a href="/#tarife">TARIFE</a>
        </nav>
      </header>
      {children}
      <footer className="cadou-footer">
        <div>{site.name} · plăți prin Stripe</div>
        <div style={{ marginTop: 8 }}>
          <Link href={getPagePath(site.locale, 'terms')}>Termeni</Link>
          {' · '}
          <Link href={getPagePath(site.locale, 'privacy')}>Confidențialitate</Link>
          {' · '}
          <Link href={getPagePath(site.locale, 'contact')}>Contact</Link>
        </div>
      </footer>
      <ChatWidget />
      <DemosPopup open={false} onClose={() => undefined} />
    </div>
  );
}
