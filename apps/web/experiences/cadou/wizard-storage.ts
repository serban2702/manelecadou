export type CadouWizardData = {
  style: string;
  occ: string;
  name: string;
  noDedic: boolean;
  about: string;
  msg: string;
  voice: 'male' | 'female' | '';
  packageTier: 'basic' | 'plus' | 'premium';
  customLyrics: string;
  useCustomLyrics: boolean;
  email: string;
  privacy: boolean;
};

export type CadouWizardSnap = {
  step: number;
  data: CadouWizardData;
  generationId: string | null;
  at: number;
};

export const EMPTY_CADOU: CadouWizardData = {
  style: '',
  occ: '',
  name: '',
  noDedic: false,
  about: '',
  msg: '',
  voice: '',
  packageTier: 'basic',
  customLyrics: '',
  useCustomLyrics: false,
  email: '',
  privacy: false,
};

const KEY = 'mc_wizard_cadou_v1';
const TTL_MS = 24 * 60 * 60 * 1000;

export function saveCadouWizard(s: CadouWizardSnap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function readCadouWizard(): CadouWizardSnap | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as CadouWizardSnap;
    if (!s || typeof s.at !== 'number' || Date.now() - s.at > TTL_MS) {
      clearCadouWizard();
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function clearCadouWizard(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
