'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';

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

type SpaNavGuard = (to: string, from: string) => boolean | Promise<boolean>;
const spaNavGuards: SpaNavGuard[] = [];

/** Guard înregistrat de un ecran (ex. studio dirty). Returnează false = anulează navigarea. */
export function useSpaNavGuard(guard: SpaNavGuard) {
  const ref = useRef(guard);
  ref.current = guard;
  useEffect(() => {
    const fn: SpaNavGuard = (to, from) => ref.current(to, from);
    spaNavGuards.push(fn);
    return () => {
      const i = spaNavGuards.indexOf(fn);
      if (i >= 0) spaNavGuards.splice(i, 1);
    };
  }, []);
}

export function SpaRouter({ children }: { children: ReactNode }) {
  const [pathname, setPathname] = useState<string>(() =>
    typeof window === 'undefined' ? '/' : window.location.pathname,
  );

  /** Ultimul pathname pe care SPA-ul chiar îl afișează (nu cel din bara de adrese
   *  în timpul unui popstate încă neconfirmat). Referință pentru revert la Back. */
  const shownRef = useRef(pathname);

  useEffect(() => {
    const sync = () => {
      shownRef.current = window.location.pathname;
      setPathname(window.location.pathname);
    };
    /**
     * Back / Forward. Browserul a schimbat DEJA URL-ul când ajungem aici, deci
     * garda se rulează post-factum: dacă userul alege „Stai aici", punem înapoi
     * pathname-ul de dinainte cu pushState (history.back() ar declanșa alt
     * popstate și ar intra în buclă). Fără asta, Back sărea peste dialogul de
     * „modificări nesalvate" și pierdeai schimbările în tăcere.
     */
    const onPop = () => {
      const to = window.location.pathname;
      const from = shownRef.current;
      if (to === from) return;
      if (spaNavGuards.length === 0) {
        sync();
        return;
      }
      void (async () => {
        for (const g of spaNavGuards) {
          const ok = await g(to, from);
          if (!ok) {
            if (window.location.pathname !== from) window.history.pushState({}, '', from);
            return;
          }
        }
        sync();
      })();
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener(SPA_NAV_EVENT, sync as EventListener);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener(SPA_NAV_EVENT, sync as EventListener);
    };
  }, []);

  const navigate = useCallback<SpaRouterCtx['navigate']>((to, opts) => {
    if (typeof window === 'undefined') return;
    const from = window.location.pathname;
    if (from === to) return;
    const run = async () => {
      for (const g of spaNavGuards) {
        const ok = await g(to, from);
        if (!ok) return;
      }
      if (window.location.pathname === to) return;
      if (opts?.replace) window.history.replaceState({}, '', to);
      else window.history.pushState({}, '', to);
      window.dispatchEvent(new Event(SPA_NAV_EVENT));
      setPathname(to);
    };
    void run();
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
