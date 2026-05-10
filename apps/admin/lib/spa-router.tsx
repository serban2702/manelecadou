'use client';

import { createContext, useCallback, useContext, useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';

/**
 * SPA router 100% client-side. Folosit ca să eliminăm RSC fetch-urile App Router-ului.
 *
 * Cum funcționează:
 *  - Citim pathname-ul din window.location, NU din Next router.
 *  - Navigarea se face cu history.pushState (browser-only). Next nu vede schimbarea,
 *    deci nu trimite request `?_rsc=...`.
 *  - Listen la `popstate` (back/forward) + custom event `spa:navigate` (pentru push-uri).
 *  - Catch-all-ul Next [[...slug]]/page.tsx asigură că orice URL deep-link returnează
 *    același shell, iar SPA-ul își alege view-ul după pathname.
 */

interface SpaRouterCtx {
  pathname: string;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
}

const Ctx = createContext<SpaRouterCtx>({ pathname: '/', navigate: () => {} });

const SPA_NAV_EVENT = 'spa:navigate';

export function SpaRouter({ children }: { children: ReactNode }) {
  const [pathname, setPathname] = useState<string>(() =>
    typeof window === 'undefined' ? '/' : window.location.pathname,
  );

  useEffect(() => {
    const sync = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', sync);
    window.addEventListener(SPA_NAV_EVENT, sync as EventListener);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(SPA_NAV_EVENT, sync as EventListener);
    };
  }, []);

  const navigate = useCallback<SpaRouterCtx['navigate']>((to, opts) => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname === to) return;
    if (opts?.replace) window.history.replaceState({}, '', to);
    else window.history.pushState({}, '', to);
    window.dispatchEvent(new Event(SPA_NAV_EVENT));
    // Sync imediat ca să nu așteptăm event-loop-ul.
    setPathname(to);
  }, []);

  return <Ctx.Provider value={{ pathname, navigate }}>{children}</Ctx.Provider>;
}

export function useSpaPathname(): string {
  return useContext(Ctx).pathname;
}

export function useSpaNavigate() {
  return useContext(Ctx).navigate;
}

/**
 * Înlocuitor 1:1 pentru `<Link>` din next/link. Folosește pushState, nu router-ul Next.
 * Click cu modifier (Ctrl/Cmd/Shift) sau pe target nou se comportă ca un `<a>` normal
 * (navigare reală în alt tab) — userul se așteaptă la asta.
 */
interface SpaLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: ReactNode;
}

export function SpaLink({ href, children, onClick, ...rest }: SpaLinkProps) {
  const navigate = useSpaNavigate();
  return (
    <a
      href={href}
      onClick={(e) => {
        if (onClick) onClick(e);
        if (e.defaultPrevented) return;
        // Lasă navigarea normală pentru: click cu modifier, target=_blank, click middle.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        if (rest.target === '_blank') return;
        e.preventDefault();
        navigate(href);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
