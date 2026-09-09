'use client';

import { useEffect, useState } from 'react';
import { Share, X } from 'lucide-react';

const DISMISS_KEY = 'mc-admin-ios-install-dismissed';

/**
 * Îndemn de instalare pe ecranul principal, afișat DOAR pe iOS în Safari, când
 * aplicația nu rulează deja ca PWA.
 *
 * Există pentru că pe iOS Web Push funcționează exclusiv din aplicația adăugată
 * pe ecranul principal: în Safari, `Notification.requestPermission()` nici nu e
 * disponibil. Chrome/Android n-au nevoie de asta (primesc push direct din
 * browser) și nici nu văd bannerul. Safari nu emite `beforeinstallprompt`, deci
 * nu există buton de instalare — pașii trebuie spuși în cuvinte.
 */
export function IosInstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ua = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua);
    if (!isIos) return;

    // `standalone` e specific iOS și nu e în tipurile standard de Navigator.
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const displayStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
    if (iosStandalone || displayStandalone) return; // deja instalat

    // Push-ul iOS cere Safari; în Chrome/Firefox pe iOS nu se poate instala PWA.
    const isSafari = !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    if (!isSafari) return;

    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      /* Safari privat aruncă la citire. Arătăm bannerul — e recuperabil. */
    }

    setShow(true);
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* Fără persistență, bannerul revine la următoarea vizită. Acceptabil. */
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 rounded-xl border border-border bg-card p-3 shadow-lg sm:left-auto sm:right-3 sm:max-w-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 rounded-lg bg-primary/15 p-2">
          <Share className="h-4 w-4 text-primary" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Instalează aplicația</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Pe iPhone, notificările merg doar din aplicația de pe ecranul principal. Apasă{' '}
            <span className="font-medium text-foreground">Share</span> în bara Safari, apoi{' '}
            <span className="font-medium text-foreground">Add to Home Screen</span>. Deschide-o de
            acolo și activează notificările.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Închide"
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
