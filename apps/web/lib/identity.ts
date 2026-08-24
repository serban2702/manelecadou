import { identifyVisitor, getGuestId, setGuestId } from './api';

function deviceField(v: unknown): string {
  if (v === undefined || v === null || Number.isNaN(v)) return 'na';
  return String(v);
}

export async function computeDeviceKey(): Promise<string> {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  const scr = typeof screen === 'undefined' ? null : screen;
  const uaData = (nav as Navigator & { userAgentData?: { platform?: string } })?.userAgentData;
  const parts = [
    scr ? `${scr.width}x${scr.height}` : 'na',
    scr ? (Math.round((window.devicePixelRatio || 1) * 100) / 100).toFixed(2) : 'na',
    deviceField((nav as Navigator & { hardwareConcurrency?: number })?.hardwareConcurrency),
    deviceField((nav as Navigator & { deviceMemory?: number })?.deviceMemory),
    deviceField(nav?.maxTouchPoints),
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'na',
    uaData?.platform || nav?.platform || 'na',
    deviceField(scr?.colorDepth),
  ];
  const raw = parts.join('|');
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  return `x${(h >>> 0).toString(16).padStart(16, '0')}`.padEnd(64, '0');
}

function readParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

const VISITOR_KEY = 'mc_visitor_id';
let memoryVisitorId: string | null = null;

/**
 * Aceeași plasă ca la guest id (vezi `lib/api.ts`): memorie → localStorage →
 * cookie. În browserele in-app de pe iOS (Facebook / Instagram / TikTok)
 * localStorage fie aruncă, fie nu persistă; cookie-ul first-party trece.
 */
function readStored(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const ls = window.localStorage.getItem(key);
    if (ls) return ls;
  } catch {
    /* storage blocat */
  }
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${key}=([^;]+)`));
    if (m) return decodeURIComponent(m[1]);
  } catch {
    /* cookies blocate */
  }
  return null;
}

/** `true` doar dacă valoarea chiar a rămas undeva (o recitim ca să fim siguri). */
function writeStored(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage blocat — încercăm cookie */
  }
  try {
    document.cookie = `${key}=${encodeURIComponent(value)}; path=/; SameSite=Lax; max-age=31536000`;
  } catch {
    /* cookies blocate */
  }
  return readStored(key) === value;
}

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Plan B când FingerprintJS pică sau depășește timeout-ul (frecvent în
 * browserele in-app). Înainte generam `nofp-<timestamp>`, unic la FIECARE
 * încărcare de pagină: un rând nou în `identity_visitors` per pageload și
 * zero continuitate. Acum id-ul e aleator o singură dată și se păstrează.
 *
 * `ephemeral` = nu am putut păstra nimic (nici localStorage, nici cookie);
 * atunci API-ul nu mai scrie deloc rânduri de identitate pentru noi.
 */
function fallbackVisitorId(): { id: string; source: 'local' | 'ephemeral' } {
  if (memoryVisitorId) return { id: memoryVisitorId, source: 'local' };
  const existing = readStored(VISITOR_KEY);
  if (existing) {
    memoryVisitorId = existing;
    return { id: existing, source: 'local' };
  }
  const id = `nofp-${randomId()}`.slice(0, 64);
  const persisted = writeStored(VISITOR_KEY, id);
  if (persisted) memoryVisitorId = id;
  return { id, source: persisted ? 'local' : 'ephemeral' };
}

export async function bootIdentity(): Promise<{ slug: string; adoptedGuest: boolean; reason?: string } | null> {
  const uiParam = readParam('ui');
  const cookieMatch = typeof document !== 'undefined'
    ? document.cookie.match(/(?:^|;\s*)mc_ui=([^;]+)/)
    : null;
  const cookieSlug = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
  let visitorId = '';
  try {
    const fpMod = await Promise.race([
      import('@fingerprintjs/fingerprintjs'),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    if (fpMod && 'load' in fpMod) {
      const fp = await fpMod.load();
      const r = await fp.get();
      visitorId = r.visitorId;
    }
  } catch {
    visitorId = '';
  }
  let source: 'fingerprint' | 'local' | 'ephemeral' = 'fingerprint';
  if (!visitorId) {
    const fallback = fallbackVisitorId();
    visitorId = fallback.id;
    source = fallback.source;
  }
  const deviceKey = await computeDeviceKey();
  try {
    const payload = {
      visitorId,
      deviceKey,
      guestId: getGuestId(),
      uiParam,
      cookieSlug,
      utm: {
        source: readParam('utm_source'),
        campaign: readParam('utm_campaign'),
        content: readParam('utm_content'),
      },
      // Spune API-ului cât de stabil e id-ul: pe `ephemeral` (fără localStorage
      // ȘI fără cookie) nu mai scrie rânduri de identitate. Câmpul nu e încă în
      // semnătura din `lib/api.ts` (alt workstream) → cast, e opțional în DTO.
      visitorIdSource: source,
    };
    const res = await identifyVisitor(payload as Parameters<typeof identifyVisitor>[0]);
    if (res.adoptedGuest && res.guestId) setGuestId(res.guestId);
    return { slug: res.experienceSlug, adoptedGuest: res.adoptedGuest, reason: res.reason };
  } catch {
    return null;
  }
}
