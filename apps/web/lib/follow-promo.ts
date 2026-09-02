'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ensureGuestSession, type FollowStatusDto } from '@/lib/api';
import { useSite } from '@/lib/site-context';

/** Codul emis la follow, ținut minte local ca să se auto-aplice la checkout. */
export const FOLLOW_PROMO_KEY = 'mc_follow_promo';

/** Cheia „am arătat deja pop-up-ul de follow pentru melodia asta". */
function popupSeenKey(generationId: string): string {
  return `mc_follow_popup:${generationId}`;
}

export function readFollowPromo(): string | null {
  try {
    return window.localStorage.getItem(FOLLOW_PROMO_KEY);
  } catch {
    return null;
  }
}

function writeFollowPromo(code: string) {
  try {
    window.localStorage.setItem(FOLLOW_PROMO_KEY, code);
  } catch {
    /* storage blocat (in-app browser) — codul se recitește oricând din API */
  }
}

export type FollowNetwork = 'facebook' | 'tiktok';

export interface FollowPromoState {
  /** Măcar o rețea e configurată pe tenant. Fals ⇒ nu randa nimic. */
  available: boolean;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  facebook: boolean;
  tiktok: boolean;
  /** Toate rețelele CONFIGURATE au fost urmărite. */
  done: boolean;
  code: string | null;
  /** Procentul real, din pachetul comenzii. `null` până răspunde API-ul. */
  percent: number | null;
  busy: FollowNetwork | null;
  mark: (network: FollowNetwork) => void;
}

/**
 * Starea „follow pe social ⇒ reducere la manea următoare", partajată de ambele
 * interfețe (classic și cadou) și de pop-up.
 *
 * Procentul NU e o constantă în frontend. A fost, iar rezultatul era că un client
 * cu pachet Plus citea „40% reducere" și primea un cod de 25%: cifra trăia în două
 * locuri care puteau să difere. Acum vine din `GET /guest-sessions/me/follow`, care
 * întoarce exact valoarea pe care o va scrie backendul pe cod.
 */
export function useFollowPromo(): FollowPromoState {
  const site = useSite();
  const [fb, setFb] = useState(false);
  const [tt, setTt] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [busy, setBusy] = useState<FollowNetwork | null>(null);

  // Fără fallback către conturile altui site: dacă tenantul n-are rețeaua
  // configurată, butonul pur și simplu nu apare.
  const facebookUrl = site.social?.facebook?.trim() || null;
  const tiktokUrl = site.social?.tiktok?.trim() || null;
  const available = !!facebookUrl || !!tiktokUrl;

  const apply = useCallback((r: FollowStatusDto) => {
    setFb(r.facebook);
    setTt(r.tiktok);
    if (typeof r.discountPercent === 'number') setPercent(r.discountPercent);
    if (r.promoCode) {
      setCode(r.promoCode);
      writeFollowPromo(r.promoCode);
    }
  }, []);

  const loaded = useRef(false);
  useEffect(() => {
    if (!available || loaded.current) return;
    loaded.current = true;
    const stored = readFollowPromo();
    if (stored) setCode(stored);
    (async () => {
      try {
        await ensureGuestSession();
        apply(await api.followStatus());
      } catch {
        /* guest lipsă — butoanele tot marchează local după click */
      }
    })();
  }, [available, apply]);

  const mark = useCallback(
    (network: FollowNetwork) => {
      const url = network === 'facebook' ? facebookUrl : tiktokUrl;
      if (!url) return;
      // Deschiderea trebuie să rămână în gestul userului: mutată după `await`,
      // Safari o blochează ca pop-up.
      window.open(url, '_blank', 'noopener,noreferrer');
      const nextFb = network === 'facebook' ? true : fb;
      const nextTt = network === 'tiktok' ? true : tt;
      setFb(nextFb);
      setTt(nextTt);
      setBusy(network);
      void (async () => {
        try {
          await ensureGuestSession();
          let r = await api.markSocialFollow(network);
          // Backendul emite codul doar când AMBELE sunt bifate. Pe un tenant cu o
          // singură rețea configurată n-ar veni niciodată, așa că marcăm și cealaltă.
          const onlyOne = !facebookUrl || !tiktokUrl;
          if (!r.promoCode && (onlyOne || (nextFb && nextTt))) {
            r = await api.markSocialFollow(network === 'facebook' ? 'tiktok' : 'facebook');
          }
          apply(r);
        } catch {
          /* click-ul tot contează local; promo-ul se emite la următorul succes */
        } finally {
          setBusy(null);
        }
      })();
    },
    [facebookUrl, tiktokUrl, fb, tt, apply],
  );

  return {
    available,
    facebookUrl,
    tiktokUrl,
    facebook: fb,
    tiktok: tt,
    done: (fb || !facebookUrl) && (tt || !tiktokUrl),
    code,
    percent,
    busy,
    mark,
  };
}

/**
 * Pop-up-ul de follow, după 30 de secunde petrecute EFECTIV pe pagina melodiei.
 *
 * Numără doar timpul cât fila e vizibilă: un tab lăsat deschis în fundal nu e
 * „a stat pe pagină", iar altfel omul s-ar întoarce peste o oră direct într-un
 * pop-up. Se arată o singură dată per melodie și niciodată cuiva care are deja
 * codul.
 */
export function useFollowPromoPopup({
  generationId,
  eligible,
  hasCode,
  delayMs = 30_000,
}: {
  generationId: string | null | undefined;
  eligible: boolean;
  hasCode: boolean;
  delayMs?: number;
}): { open: boolean; close: () => void } {
  const [open, setOpen] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!generationId || !eligible || hasCode || firedRef.current) return;
    try {
      if (window.localStorage.getItem(popupSeenKey(generationId)) === '1') {
        firedRef.current = true;
        return;
      }
    } catch {
      /* storage blocat — îl arătăm o dată pe încărcare, tot e mai bun decât deloc */
    }

    let elapsed = 0;
    let last = Date.now();
    const tick = window.setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === 'visible') elapsed += now - last;
      last = now;
      if (elapsed < delayMs) return;
      window.clearInterval(tick);
      firedRef.current = true;
      try {
        window.localStorage.setItem(popupSeenKey(generationId), '1');
      } catch {
        /* storage blocat */
      }
      setOpen(true);
    }, 1000);

    return () => window.clearInterval(tick);
  }, [generationId, eligible, hasCode, delayMs]);

  const close = useCallback(() => setOpen(false), []);
  return { open, close };
}
