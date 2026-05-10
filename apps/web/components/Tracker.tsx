'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { initTracker, trackPageView } from '@/lib/tracker';

export function Tracker() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    initTracker();
  }, []);

  useEffect(() => {
    if (!pathname) return;
    // Re-emite page view la fiecare schimbare de rută client-side.
    trackPageView(pathname);
    // search nu apare în path, dar îl introducem în props prin tracker (URL/search)
  }, [pathname, search]);

  return null;
}
