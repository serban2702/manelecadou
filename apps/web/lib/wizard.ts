'use client';

import { useEffect, useState } from 'react';

/**
 * Persistența progresului din wizardul de generare (Generator.tsx) + utilitare
 * pentru pop-up-ul global de demo-uri.
 *
 * Scop (2026-06-25): dacă userul completează formularul, pleacă de pe pagină
 * (ex. la /asculta) și se întoarce, trebuie să-l readucem la pasul + datele
 * unde a rămas — nu la pasul 1. Și, odată ce a ajuns la pasul de alegere a
 * pachetului, butoanele „ascultă" din site deschid un pop-up în loc să-l ducă
 * pe /asculta (ca să nu părăsească comanda aproape de plată).
 */
export type WizardSnapshot = {
  step: number;
  data: Record<string, unknown>;
  generationId: string | null;
  emailDraft?: string;
  /** A ajuns la pasul de pachet / plată → butoanele „ascultă" devin pop-up. */
  reachedPackage: boolean;
  at: number;
};

const KEY = 'mc_wizard_v1';
// Coșuri mai vechi de o zi se consideră stale (userul a uitat de ele) — la
// restore le ignorăm și curățăm, ca să nu „bântuie" o vizită nouă.
const TTL_MS = 24 * 60 * 60 * 1000;

export function saveWizard(s: WizardSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage plin / blocat (Safari privat) — ignorăm, nu e critic */
  }
}

export function readWizard(): WizardSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as WizardSnapshot;
    if (!s || typeof s.at !== 'number' || Date.now() - s.at > TTL_MS) {
      clearWizard();
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function clearWizard(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

/** Deschide pop-up-ul global de demo-uri (ascultare), de oriunde din site. */
export function openDemosModal(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('mc:open_demos'));
}

/**
 * `true` cât timp wizardul a ajuns la pasul de pachet / plată. Atunci butoanele
 * „ascultă" din site deschid pop-up-ul în loc să navigheze la /asculta. Se
 * sincronizează din evenimentul live `mc:generator_state` (emis de Generator)
 * + starea persistată (ca să fie corect și după navigare între pagini, unde
 * Generatorul nu e montat).
 */
export function useWizardReachedPackage(): boolean {
  const [reached, setReached] = useState(false);
  useEffect(() => {
    const snap = readWizard();
    if (snap?.reachedPackage) setReached(true);
    const onState = (e: Event) => {
      const detail = (e as CustomEvent).detail as { reachedPackage?: unknown } | undefined;
      if (detail && typeof detail.reachedPackage === 'boolean') {
        setReached(detail.reachedPackage);
      }
    };
    window.addEventListener('mc:generator_state', onState);
    return () => window.removeEventListener('mc:generator_state', onState);
  }, []);
  return reached;
}
