'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Coins,
  CreditCard,
  Crown,
  Database,
  FileText,
  Gift,
  Globe,
  Inbox,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageSquare,
  Music2,
  Mic2,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Send,
  Settings as SettingsIcon,
  SquareTerminal,
  Tag,
  Terminal,
  UserCircle2,
  Users,
  Users2,
} from 'lucide-react';
import { SiteSelector } from '@/components/site-selector';
import { ScopeBanner } from '@/components/scope-banner';
import { AuthApi, ChatApi, ErrorsApi, MailApi } from '@/lib/api';
import { ALL_SITES, getSelectedSiteId } from '@/lib/api/sites.api';
import { getAdminToken, setAdminToken } from '@/lib/http/client';
import { useAsync } from '@/lib/hooks/use-async';
import { SpaLink, SpaRouter, useSpaPathname } from '@/lib/spa-router';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

type NavScope = 'global' | 'per-site' | 'both';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /**
   *  scope = 'global'   → vizibil DOAR în „Toate site-urile" (Sites/Database/Settings/Suno credits — operează la nivel de DB/cont).
   *  scope = 'per-site' → vizibil DOAR când e selectat un site (Chat/Inbox/Knowledge — backend-ul refuză cross-tenant).
   *  scope = 'both'     → mereu vizibil (datele se filtrează automat după selector).
   */
  scope: NavScope;
  /** `mobile: true` → secțiunea apare și pe telefon. Restul sunt ascunse sub `md`. */
  mobile?: boolean;
};

const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, scope: 'both', mobile: true },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, scope: 'both', mobile: true },
  { href: '/chat', label: 'Chat', icon: MessageSquare, scope: 'both', mobile: true },
  { href: '/ai-memory', label: 'AI Memory', icon: BookOpen, scope: 'both' },
  { href: '/ai-monitor', label: 'AI Monitor', icon: Terminal, scope: 'both' },
  { href: '/inbox', label: 'Inbox', icon: Inbox, scope: 'both' },
  { href: '/inbox/knowledge', label: 'Knowledge', icon: BookOpen, scope: 'per-site' },
  { href: '/seo-pages', label: 'SEO articles', icon: FileText, scope: 'per-site' },
  { href: '/site-demos', label: 'Demo-uri ascultă', icon: Music2, scope: 'per-site' },
  { href: '/generations', label: 'Generations', icon: Music2, scope: 'both', mobile: true },
  { href: '/suno', label: 'Suno credits', icon: Coins, scope: 'global' },
  { href: '/lyrics', label: 'Lyrics (AI)', icon: Mic2, scope: 'global' },
  { href: '/users', label: 'Users', icon: Users, scope: 'both' },
  { href: '/guests', label: 'Guests', icon: Users2, scope: 'both' },
  { href: '/payments', label: 'Payments', icon: CreditCard, scope: 'both', mobile: true },
  { href: '/facturare', label: 'Facturare', icon: Receipt, scope: 'both' },
  { href: '/promo', label: 'Promo', icon: Tag, scope: 'both', mobile: true },
  { href: '/gift-codes', label: 'Gift codes', icon: Gift, scope: 'per-site' },
  { href: '/marketing', label: 'Marketing', icon: Megaphone, scope: 'both' },
  { href: '/emails', label: 'Emails trimise', icon: Send, scope: 'both', mobile: true },
  { href: '/errors', label: 'Errors', icon: AlertTriangle, scope: 'both' },
  { href: '/sites', label: 'Toate site-urile', icon: Globe, scope: 'both', mobile: true },
  { href: '/site', label: 'Acest site', icon: Globe, scope: 'per-site' },
  { href: '/database', label: 'Database', icon: Database, scope: 'global' },
  { href: '/terminal', label: 'Claude Ops', icon: SquareTerminal, scope: 'both', mobile: true },
  { href: '/settings', label: 'Settings', icon: SettingsIcon, scope: 'global' },
];

/**
 * Layout-ul admin. Wrapper-ul exterior pune SpaRouter în jurul tot — așa orice
 * `<SpaLink>` și `useSpaPathname` din interior funcționează. Layout-ul nu mai
 * folosește deloc next/router sau next/link — toate "navigările" sunt pure
 * client-side via history.pushState.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SpaRouter>
      <DashboardShell>{children}</DashboardShell>
    </SpaRouter>
  );
}

function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = useSpaPathname();

  // Inițializăm cu `null` ca server și client să randeze IDENTIC la primul pass
  // (skeleton-ul de loading). Decizia auth se ia DUPĂ hydration, în useEffect —
  // altfel React vede HTML diferit pe server vs client (hydration mismatch).
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [me, setMe] = useState<{ email: string } | null>(null);

  // Sidebar deschis/închis. Pe desktop = rezervă coloana de 60 (persistat în
  // localStorage). Pe mobil = drawer off-canvas peste conținut (default închis).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('mc_admin_sidebar') : null;
    if (saved !== null) setSidebarOpen(saved === '1');
    else setSidebarOpen(typeof window !== 'undefined' && window.innerWidth >= 768);
  }, []);
  const toggleSidebar = () =>
    setSidebarOpen((v) => {
      const next = !v;
      try { localStorage.setItem('mc_admin_sidebar', next ? '1' : '0'); } catch {/* ignore */}
      return next;
    });
  // Click pe un link de nav pe mobil închide drawer-ul (fără a-l persista pe desktop).
  const closeSidebarOnMobile = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) setSidebarOpen(false);
  };

  // Resolve auth state DUPĂ hydration (citirea localStorage e client-only).
  useEffect(() => {
    setAuthed(getAdminToken() ? true : false);
  }, []);

  useEffect(() => {
    if (authed === false && typeof window !== 'undefined') {
      // /login e o rută Next separată, nu sub SPA — full navigation e ok aici.
      window.location.href = '/login';
      return;
    }
    if (authed === true && !me) {
      AuthApi.me()
        .then((u) => setMe(u))
        .catch((e) => {
          // Doar 401/403 = chiar nu ești autentificat → logout. Erorile tranzitorii
          // (429 rate-limit, 5xx, network) NU trebuie să te deconecteze — altfel un
          // 429 pe /auth/me te dădea afară imediat după login (bounce → relogin → 429…).
          const status = (e as { status?: number })?.status;
          if (status === 401 || status === 403) {
            setAdminToken(null);
            setAuthed(false);
          }
        });
    }
  }, [authed, me]);

  // Re-evaluăm selectorul de site când se schimbă (eveniment global mc:site-changed
  // emis de SiteSelector). Chat/Inbox sunt scoped per-site — pe „all" backend-ul
  // răspunde 403 (by-design), așa că skipuim polling-ul ca să nu spam-uim consola.
  const [selectedSite, setSelectedSite] = useState<string>(ALL_SITES);
  useEffect(() => {
    setSelectedSite(getSelectedSiteId());
    const onChange = () => setSelectedSite(getSelectedSiteId());
    window.addEventListener('mc:site-changed', onChange);
    return () => window.removeEventListener('mc:site-changed', onChange);
  }, []);
  // Chat & Inbox sunt acum cross-tenant — badge-urile se actualizează în orice scope.
  // 2026-06-10: endpoint dedicat (un SUM) în loc de toată lista augmentată la 5s.
  const { data: chatUnread } = useAsync(
    () => ChatApi.unreadTotal(),
    [authed, selectedSite],
    { enabled: authed === true, refetchInterval: 5000 },
  );
  const unreadTotal = chatUnread?.unread ?? 0;

  const { data: errStats } = useAsync(
    () => ErrorsApi.stats(),
    [authed],
    { enabled: authed === true, refetchInterval: 10_000 },
  );
  const unresolvedErrors = errStats?.unresolved ?? 0;

  const { data: mailUnread } = useAsync(
    () => MailApi.unreadTotal(),
    [authed, selectedSite],
    { enabled: authed === true, refetchInterval: 15_000 },
  );
  const mailUnreadCount = mailUnread?.unread ?? 0;

  if (authed === null) {
    return (
      <div className="min-h-screen flex">
        <aside className="w-60 border-r border-border bg-card/40 p-4 hidden md:block">
          <Skeleton className="h-10 w-32 mb-6" />
          <div className="space-y-2">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </aside>
        <main className="flex-1 p-6">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64 mb-8" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Backdrop pentru drawer-ul de mobil */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-60 shrink-0 border-r border-border bg-card flex flex-col h-screen transition-transform duration-200 ease-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-amber-300 flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
              <Crown className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate">Manele Cadou</div>
              <div className="text-[11px] text-muted-foreground">Panou admin</div>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="md:hidden h-8 w-8 -mr-1 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Închide meniul"
            >
              <PanelLeftClose className="h-5 w-5" />
            </button>
          </div>
        </div>

        <SiteSelector />

        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {(() => {
            // Filtrare după scope-ul curent — selectorul controlează ce e relevant.
            const isAllScope = selectedSite === ALL_SITES;
            const visibleNav = NAV.filter((n) => {
              if (n.scope === 'both') return true;
              if (n.scope === 'global') return isAllScope; // Sites/Database/Settings/Suno credits doar pe „Toate"
              if (n.scope === 'per-site') return !isAllScope; // Chat/Inbox/Knowledge doar când ai un site
              return true;
            });

            // Cel mai lung href care e prefix al pathname-ului câștigă —
            // așa /inbox/knowledge marchează doar Knowledge, nu și Inbox.
            const candidates = visibleNav.filter(
              (n) => pathname === n.href || (n.href !== '/' && pathname.startsWith(n.href + '/')) || (n.href !== '/' && pathname === n.href),
            );
            const activeHref = candidates.length
              ? candidates.reduce((a, b) => (b.href.length > a.href.length ? b : a)).href
              : pathname === '/' ? '/' : null;
            return visibleNav.map((n) => {
            const active = n.href === activeHref;
            const Icon = n.icon;
            const badge =
              n.href === '/chat' ? unreadTotal :
              n.href === '/inbox' ? mailUnreadCount :
              n.href === '/errors' ? unresolvedErrors : 0;
            return (
              <SpaLink
                key={n.href}
                href={n.href}
                onClick={closeSidebarOnMobile}
                className={cn(
                  'group flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                  // Secțiunile fără `mobile` nu apar pe telefon (cerere user).
                  n.mobile ? 'flex' : 'hidden md:flex',
                  active
                    ? 'bg-primary/15 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0 transition-transform', active && 'scale-110')} />
                <span className="flex-1 truncate">{n.label}</span>
                {badge > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </SpaLink>
            );
            });
          })()}
        </nav>

        <div className="p-3 border-t border-border space-y-1">
          {me && (
            <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
              <UserCircle2 className="h-4 w-4" />
              <span className="truncate" title={me.email}>{me.email}</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => {
              setAdminToken(null);
              window.location.href = '/login';
            }}
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>

      <main className={cn(
        'min-w-0 overflow-x-hidden transition-[margin,background-color] duration-200',
        // Tint subtil al întregului main când suntem pe „toate site-urile"
        // — întărește vizual că ești în mod cross-tenant.
        selectedSite === ALL_SITES && 'bg-amber-500/[0.015]',
        // Pe desktop rezervăm coloana sidebar-ului când e deschis; pe mobil drawer-ul plutește deasupra.
        sidebarOpen ? 'md:ml-60' : 'md:ml-0',
      )}>
        <ScopeBanner
          leading={
            <button
              type="button"
              onClick={toggleSidebar}
              className="h-8 w-8 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              title={sidebarOpen ? 'Ascunde meniul' : 'Arată meniul'}
              aria-label={sidebarOpen ? 'Ascunde meniul' : 'Arată meniul'}
            >
              {sidebarOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
            </button>
          }
        />
        <div className="px-4 md:px-6 py-5 md:py-6 max-w-[1600px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
