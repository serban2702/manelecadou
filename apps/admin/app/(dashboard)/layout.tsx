'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  ChevronRight,
  Coins,
  Contact,
  CreditCard,
  Crown,
  Database,
  FileText,
  FolderCog,
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
  ShieldCheck,
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
   *  scope = 'per-site' → vizibil DOAR când e selectat un site (Knowledge/SEO/Gift codes — backend-ul refuză cross-tenant).
   *  scope = 'both'     → mereu vizibil (datele se filtrează automat după selector).
   */
  scope: NavScope;
};

type NavGroup = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: NavItem[];
};

type NavEntry = NavItem | NavGroup;

function isGroup(e: NavEntry): e is NavGroup {
  return 'children' in e;
}

/**
 * Sidebar DESKTOP (cerință 2026-07-07): items principale + două grupuri
 * colapsabile („Administrare", „Gestionare") care strâng restul paginilor.
 */
const DESKTOP_NAV: NavEntry[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, scope: 'both' },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, scope: 'both' },
  { href: '/chat', label: 'Chat', icon: MessageSquare, scope: 'both' },
  { href: '/payments', label: 'Payments', icon: CreditCard, scope: 'both' },
  { href: '/facturare', label: 'Facturare', icon: Receipt, scope: 'both' },
  { href: '/promo', label: 'Promo', icon: Tag, scope: 'both' },
  { href: '/inbox', label: 'Email', icon: Inbox, scope: 'both' },
  {
    key: 'administrare',
    label: 'Administrare',
    icon: ShieldCheck,
    children: [
      { href: '/users', label: 'Utilizatori', icon: Users, scope: 'both' },
      { href: '/clienti', label: 'Clienți', icon: Contact, scope: 'both' },
      { href: '/inbox/knowledge', label: 'Knowledge', icon: BookOpen, scope: 'per-site' },
    ],
  },
  {
    key: 'gestionare',
    label: 'Gestionare',
    icon: FolderCog,
    children: [
      { href: '/seo-pages', label: 'SEO articles', icon: FileText, scope: 'per-site' },
      { href: '/generations', label: 'Generations', icon: Music2, scope: 'both' },
      { href: '/site-demos', label: 'Demo-uri ascultă', icon: Music2, scope: 'per-site' },
      { href: '/gift-codes', label: 'Gift codes', icon: Gift, scope: 'per-site' },
      { href: '/marketing', label: 'Marketing', icon: Megaphone, scope: 'both' },
      { href: '/emails', label: 'Emails trimise', icon: Send, scope: 'both' },
      { href: '/ai-memory', label: 'AI Memory', icon: BookOpen, scope: 'both' },
      { href: '/ai-monitor', label: 'AI Monitor', icon: Terminal, scope: 'both' },
      { href: '/guests', label: 'Guests', icon: Users2, scope: 'both' },
      { href: '/suno', label: 'Suno credits', icon: Coins, scope: 'global' },
      { href: '/lyrics', label: 'Lyrics (AI)', icon: Mic2, scope: 'global' },
      { href: '/errors', label: 'Errors', icon: AlertTriangle, scope: 'both' },
      { href: '/database', label: 'Database', icon: Database, scope: 'global' },
      { href: '/terminal', label: 'Claude Ops', icon: SquareTerminal, scope: 'both' },
      { href: '/settings', label: 'Settings', icon: SettingsIcon, scope: 'global' },
    ],
  },
  { href: '/site', label: 'Acest site', icon: Globe, scope: 'per-site' },
  { href: '/sites', label: 'Toate site-urile', icon: Globe, scope: 'both' },
];

/** Sidebar TELEFON — neschimbat de refactorul desktop (aceleași secțiuni ca înainte). */
const MOBILE_NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, scope: 'both' },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, scope: 'both' },
  { href: '/chat', label: 'Chat', icon: MessageSquare, scope: 'both' },
  { href: '/generations', label: 'Generations', icon: Music2, scope: 'both' },
  { href: '/payments', label: 'Payments', icon: CreditCard, scope: 'both' },
  { href: '/promo', label: 'Promo', icon: Tag, scope: 'both' },
  { href: '/emails', label: 'Emails trimise', icon: Send, scope: 'both' },
  { href: '/sites', label: 'Toate site-urile', icon: Globe, scope: 'both' },
  { href: '/terminal', label: 'Claude Ops', icon: SquareTerminal, scope: 'both' },
];

const NAV_GROUPS_STORAGE_KEY = 'mc_admin_nav_groups';

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

  // Grupurile colapsabile din sidebar-ul desktop (Administrare / Gestionare).
  // Stare persistată; grupul cu ruta activă se deschide automat la navigare.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(NAV_GROUPS_STORAGE_KEY);
      if (raw) setOpenGroups(JSON.parse(raw) as Record<string, boolean>);
    } catch {/* ignore */}
  }, []);
  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(NAV_GROUPS_STORAGE_KEY, JSON.stringify(next)); } catch {/* ignore */}
      return next;
    });

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
            const scopeVisible = (n: NavItem) => {
              if (n.scope === 'both') return true;
              if (n.scope === 'global') return isAllScope; // Database/Settings/Suno credits doar pe „Toate"
              return !isAllScope; // per-site doar când ai un site selectat
            };

            const badgeFor = (href: string) =>
              href === '/chat' ? unreadTotal :
              href === '/inbox' ? mailUnreadCount :
              href === '/errors' ? unresolvedErrors : 0;

            // Grupurile își păstrează doar copiii vizibili; grup gol = ascuns.
            const desktopNav = DESKTOP_NAV
              .map((e) => (isGroup(e) ? { ...e, children: e.children.filter(scopeVisible) } : e))
              .filter((e) => (isGroup(e) ? e.children.length > 0 : scopeVisible(e)));

            // Cel mai lung href care e prefix al pathname-ului câștigă —
            // așa /inbox/knowledge marchează doar Knowledge, nu și Email.
            const leaves = desktopNav.flatMap((e) => (isGroup(e) ? e.children : [e]));
            const candidates = leaves.filter(
              (n) => pathname === n.href || (n.href !== '/' && pathname.startsWith(n.href + '/')),
            );
            const activeHref = candidates.length
              ? candidates.reduce((a, b) => (b.href.length > a.href.length ? b : a)).href
              : pathname === '/' ? '/' : null;

            const renderLink = (n: NavItem, indent = false) => {
              const active = n.href === activeHref;
              const Icon = n.icon;
              const badge = badgeFor(n.href);
              return (
                <SpaLink
                  key={n.href}
                  href={n.href}
                  onClick={closeSidebarOnMobile}
                  className={cn(
                    'group flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                    indent && 'ml-4 pl-2 border-l border-border/60 rounded-l-none',
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
            };

            return (
              <>
                {/* Telefon: lista plată de dinainte de refactor (cerință: doar desktop-ul se schimbă). */}
                <div className="md:hidden space-y-0.5">
                  {MOBILE_NAV.filter(scopeVisible).map((n) => renderLink(n))}
                </div>

                {/* Desktop: items + grupuri colapsabile. */}
                <div className="hidden md:block space-y-0.5">
                  {desktopNav.map((e) => {
                    if (!isGroup(e)) return renderLink(e);
                    const groupActive = e.children.some((c) => c.href === activeHref);
                    // Grupul cu ruta activă rămâne deschis chiar dacă a fost strâns.
                    const open = (openGroups[e.key] ?? false) || groupActive;
                    const GroupIcon = e.icon;
                    const groupBadge = e.children.reduce((acc, c) => acc + badgeFor(c.href), 0);
                    return (
                      <div key={e.key}>
                        <button
                          type="button"
                          onClick={() => toggleGroup(e.key)}
                          className={cn(
                            'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                            groupActive && !open
                              ? 'text-primary font-medium'
                              : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                          )}
                          aria-expanded={open}
                        >
                          <GroupIcon className="h-4 w-4 shrink-0" />
                          <span className="flex-1 truncate text-left">{e.label}</span>
                          {!open && groupBadge > 0 && (
                            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
                              {groupBadge > 99 ? '99+' : groupBadge}
                            </span>
                          )}
                          <ChevronRight
                            className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-90')}
                          />
                        </button>
                        {open && (
                          <div className="mt-0.5 space-y-0.5">
                            {e.children.map((c) => renderLink(c, true))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            );
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
