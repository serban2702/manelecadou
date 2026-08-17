'use client';

import { useEffect, useRef } from 'react';
import { bootIdentity } from '@/lib/identity';
import { useExperience } from '@/lib/experience-context';

export function ExperienceBoot() {
  const exp = useExperience();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const ui = new URLSearchParams(window.location.search).get('ui');
    void (async () => {
      const r = await bootIdentity();
      if (!r) return;
      if (r.adoptedGuest) {
        window.dispatchEvent(new CustomEvent('mc:identity-adopted'));
      }
      if (!ui && r.slug && r.slug !== exp.slug) {
        try {
          if (sessionStorage.getItem('mc_ui_reloaded')) return;
          sessionStorage.setItem('mc_ui_reloaded', '1');
        } catch {
          return;
        }
        document.cookie = `mc_ui=${encodeURIComponent(r.slug)}; path=/; SameSite=Lax; max-age=31536000`;
        try { localStorage.setItem('mc_ui', r.slug); } catch { /* ignore */ }
        window.location.reload();
      }
    })();
  }, [exp.slug]);

  return null;
}
