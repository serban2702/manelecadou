'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { useSpaPathname } from '@/lib/spa-router';
import type { ComponentType } from 'react';

/**
 * Singura rută Next.js sub /(dashboard).
 *
 * Toate URL-urile (`/`, `/inbox`, `/settings`, `/inbox/accounts`, etc.) ajung aici.
 * Sidebar-ul folosește SpaLink care face history.pushState fără să ruleze router-ul Next,
 * deci NU se mai produc request-uri `?_rsc=...` la navigare. Practic: o aplicație
 * React standard cu router intern, găzduită într-un Next.js shell.
 *
 * Fiecare view e import-ată lazy ca chunk JS separat — așa pagina activă nu trage
 * după ea bundle-urile celorlalte view-uri.
 */

function Loading() {
  return (
    <div>
      <Skeleton className="h-7 w-56 mb-2" />
      <Skeleton className="h-4 w-80 mb-6" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

// Next.js cere ca options-ul `dynamic` să fie object literal — nu putem extrage într-o variabilă.
const Dashboard       = dynamic(() => import('../_content'),                 { ssr: false, loading: Loading });
const Chat            = dynamic(() => import('../chat/_content'),            { ssr: false, loading: Loading });
const Inbox           = dynamic(() => import('../inbox/_content'),           { ssr: false, loading: Loading });
const InboxAccounts   = dynamic(() => import('../inbox/accounts/_content'),  { ssr: false, loading: Loading });
const InboxKnowledge  = dynamic(() => import('../inbox/knowledge/_content'), { ssr: false, loading: Loading });
const Settings        = dynamic(() => import('../settings/_content'),        { ssr: false, loading: Loading });
const Promo           = dynamic(() => import('../promo/_content'),           { ssr: false, loading: Loading });
const Errors          = dynamic(() => import('../errors/_content'),          { ssr: false, loading: Loading });
const GiftCodes       = dynamic(() => import('../gift-codes/_content'),      { ssr: false, loading: Loading });
const Generations     = dynamic(() => import('../generations/_content'),     { ssr: false, loading: Loading });
const Payments        = dynamic(() => import('../payments/_content'),        { ssr: false, loading: Loading });
const Users           = dynamic(() => import('../users/_content'),           { ssr: false, loading: Loading });
const Guests          = dynamic(() => import('../guests/_content'),          { ssr: false, loading: Loading });
const Suno            = dynamic(() => import('../suno/_content'),            { ssr: false, loading: Loading });
const Lyrics          = dynamic(() => import('../lyrics/_content'),          { ssr: false, loading: Loading });
const Analytics       = dynamic(() => import('../analytics/_content'),       { ssr: false, loading: Loading });
const DatabaseAdmin   = dynamic(() => import('../database/_content'),        { ssr: false, loading: Loading });
const Sites           = dynamic(() => import('../sites/_content'),           { ssr: false, loading: Loading });
const SiteConfig      = dynamic(() => import('../site/_content'),            { ssr: false, loading: Loading });
const AiMemory        = dynamic(() => import('../ai-memory/_content'),       { ssr: false, loading: Loading });

const ROUTES: Record<string, ComponentType> = {
  '/':                   Dashboard,
  '/chat':               Chat,
  '/inbox':              Inbox,
  '/inbox/accounts':     InboxAccounts,
  '/inbox/knowledge':    InboxKnowledge,
  '/settings':           Settings,
  '/promo':              Promo,
  '/errors':             Errors,
  '/gift-codes':         GiftCodes,
  '/generations':        Generations,
  '/payments':           Payments,
  '/users':              Users,
  '/guests':             Guests,
  '/suno':               Suno,
  '/lyrics':             Lyrics,
  '/analytics':          Analytics,
  '/database':           DatabaseAdmin,
  '/sites':              Sites,
  '/site':               SiteConfig,
  '/ai-memory':          AiMemory,
};

export default function CatchAll() {
  const pathname = useSpaPathname();
  // Normalize trailing slash.
  const key = pathname.replace(/\/+$/, '') || '/';
  const View = ROUTES[key];
  if (!View) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-semibold mb-2">404</h1>
        <p className="text-muted-foreground text-sm">Pagina <code>{pathname}</code> nu există.</p>
      </div>
    );
  }
  return <View />;
}
