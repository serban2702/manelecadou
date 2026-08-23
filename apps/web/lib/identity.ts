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
  if (!visitorId) visitorId = `nofp-${Date.now().toString(36)}`;
  const deviceKey = await computeDeviceKey();
  try {
    const res = await identifyVisitor({
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
    });
    if (res.adoptedGuest && res.guestId) setGuestId(res.guestId);
    return { slug: res.experienceSlug, adoptedGuest: res.adoptedGuest, reason: res.reason };
  } catch {
    return null;
  }
}
