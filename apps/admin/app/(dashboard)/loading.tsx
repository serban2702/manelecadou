/**
 * Skeleton afișat INSTANT la fiecare navigare în (dashboard).
 *
 * App Router îl pune între click → vine răspunsul RSC pentru noua rută.
 * Fără el, navigarea ar bloca pe `/pagina?_rsc=...` și utilizatorul ar vedea
 * vechea pagină până se întoarce payload-ul. Cu el, vezi skeleton imediat.
 *
 * Componenta e Server Component pură (fără 'use client') ca să fie cât mai
 * ieftin de randat — Next o servește instant fără hydration.
 */

import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
