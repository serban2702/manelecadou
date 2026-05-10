'use client';

import dynamic from 'next/dynamic';
import type { ComponentType, ReactElement } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Wrap-er pentru pagini "client-only" în App Router.
 *
 * Elimină complet rendering-ul server-side al conținutului unei pagini:
 *  - RSC payload-ul rutei e doar un stub gol (placeholder)
 *  - Conținutul real e încărcat ca chunk JS lazy, după mount
 *  - Comportament 100% SPA: navigarea e instant, nu există blocaj de network
 *    pe RSC (decât pentru shell-ul gol, care vine în <5ms)
 *
 * Folosit în page.tsx-uri:
 *   const Content = clientOnly(() => import('./_content'));
 *   export default function Page() { return <Content />; }
 */
export function clientOnly<P extends object = {}>(
  loader: () => Promise<{ default: ComponentType<P> }>,
  loadingElement?: ReactElement,
): ComponentType<P> {
  return dynamic(loader, {
    ssr: false,
    loading: () => loadingElement ?? <DefaultLoading />,
  });
}

function DefaultLoading() {
  return (
    <div>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
