'use client';

import type { PackageTier } from './packages';

/** Raport de aspect pentru colaje / image→video. */
export type CollageAspect = '9x16' | '1x1' | '16x9';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:1501';
const GUEST_KEY = 'mc_guest_id';
const TOKEN_KEY = 'mc_access_token';

/**
 * URL-urile media (`/uploads/...`) vin relativ din API. În prod sunt
 * rezolvate same-origin de Caddy; în dev (web pe :1500, api pe :1501)
 * trebuie prefixate cu API_URL ca să ajungă la backend.
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  if (url.startsWith('/')) return `${API_URL}${url}`;
  return url;
}

export function getGuestId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(GUEST_KEY);
}

export function setGuestId(id: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(GUEST_KEY, id);
  document.cookie = `${GUEST_KEY}=${id}; path=/; SameSite=Lax; max-age=31536000`;
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

function getCurrentLocale(): string {
  if (typeof window !== 'undefined') {
    // SiteProvider stash-uiește locale-ul site-ului curent (prioritar — un
    // domeniu = o limbă; cookie e secundar pentru cazuri cu switcher).
    const fromSite = (window as unknown as { __SITE_LOCALE__?: string }).__SITE_LOCALE__;
    if (fromSite) return fromSite;
  }
  if (typeof document !== 'undefined') {
    const m = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  return process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'ro';
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('X-Locale', getCurrentLocale());

  const guestId = getGuestId();
  if (guestId) headers.set('X-Guest-Id', guestId);

  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  // OpenReplay session-id, dacă tracker-ul a pornit (vezi components/OpenReplay.tsx).
  // Permite backend-ului să coreleze rândul din DB (errors / payments / generations)
  // cu sesiunea video — jump direct din admin în replay.
  if (typeof window !== 'undefined') {
    const orSid = window.__OR_SESSION_ID__;
    if (orSid) headers.set('X-OpenReplay-SessionID', orSid);
  }

  // Headere extra (ex. `x-unlock-password` pentru conținut privat).
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
  }

  const url = path.startsWith('http') ? path : `${API_URL}/api${path}`;
  const res = await fetch(url, { ...init, headers });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(typeof body === 'string' ? body : (body as { message?: string })?.message ?? `HTTP ${status}`);
  }
}

export async function ensureGuestSession(): Promise<string> {
  const existing = getGuestId();
  if (existing) return existing;
  const created = await request<{ id: string }>('/guest-sessions', {
    method: 'POST',
    body: JSON.stringify({
      locale: typeof navigator !== 'undefined' ? navigator.language : undefined,
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    }),
  });
  setGuestId(created.id);
  return created.id;
}

export interface MeGuest {
  id: string | null;
  freeDemoUsed: boolean;
  email: string | null;
  claimedByUserId?: string | null;
}

export interface MeUser {
  id: string;
  email: string;
  name: string | null;
  role: 'user' | 'admin';
  freeDemoUsed: boolean;
  createdAt: string;
}

export type GenStatus =
  | 'pending'
  | 'queued'
  | 'writing_lyrics'
  | 'checking_lyrics'
  | 'generating_audio'
  | 'running'
  | 'succeeded'
  | 'failed';

export interface GenerationDto {
  id: string;
  ownerUserId: string | null;
  ownerGuestId: string | null;
  type: 'demo' | 'full';
  status: GenStatus;
  durationSec: number;
  style: string;
  occasion: string;
  recipientName: string;
  message: string;
  dedication: string | null;
  voiceArtist: string;
  customLyrics: string | null;
  lyricsDraft: string | null;
  lyrics: string | null;
  tipAmount: number;
  premium: boolean;
  paidUnlocked: boolean;
  audioUrl: string | null;
  bonusAudioUrl: string | null;
  tracks: Array<{ audioUrl: string; durationSec: number; coverUrl?: string }> | null;
  coverUrl: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  // ── Pachete (model nou) ──────────────────────────────────────────────────
  packageTier?: PackageTier;
  /** Variante de poză de share generate (plus/premium). */
  socialImages?: string[];
  /** Varianta selectată de user (sau prima implicit). */
  socialImageSelected?: string | null;
  /** Poză încărcată de user (override). */
  socialImageUploaded?: string | null;
  /** Versiune instrumentală (plus/premium). */
  instrumentalUrl?: string | null;
  /** Videoclip personalizat (premium) — versiunea 1. */
  videoUrl?: string | null;
  /** Videoclip pentru a 2-a versiune de melodie (premium). */
  videoUrlBonus?: string | null;
  /** false cât timp livrabilele extra (instrumental/imagini) încă se generează în fundal. */
  deliverablesReady?: boolean;
  // ── Owner / privacy ──────────────────────────────────────────────────────
  /** true dacă vizitatorul deține maneaua (același user logat / aceeași sesiune guest). */
  isOwner?: boolean;
  /** owner-ul a setat o parolă de privacy peste pozele/colajele private. */
  hasUnlockPassword?: boolean;
  /** request-ul a furnizat parola corectă (sau e owner) → conținutul privat e vizibil. */
  unlocked?: boolean;
  /** Parola/PIN în clar — prezent DOAR în payload-ul owner-ului (ca s-o partajeze). */
  unlockPin?: string | null;
}

/** Colaj video sau image→video atașat unei generări. */
export interface CollageDto {
  id: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  videoUrl?: string | null;
  track?: string;
  kind?: 'collage' | 'image_video';
  aspect?: string;
  imageCount?: number;
  error?: string | null;
}

export interface RecentDto {
  id: string;
  style: string;
  occasion: string;
  recipientName: string;
  senderName?: string | null;
  voiceArtist: string;
  audioUrl: string | null;
  coverUrl: string | null;
  createdAt: string;
}

export interface PriceQuote {
  packageTier: PackageTier;
  total: number;
  currency: string;
}

export interface CreateGenerationInput {
  type: 'demo' | 'full';
  style: string;
  occasion: string;
  recipientName: string;
  message: string;
  dedication?: string;
  voiceArtist: string;
  customLyrics?: string;
  tipAmount?: number;
  premium?: boolean;
  paymentId?: string;
  locale?: string;
}

export interface ChatConversation {
  id: string;
  userId: string | null;
  guestId: string | null;
  email: string | null;
  subject: string;
  unreadByUser: number;
  unreadByAdmin: number;
  status: 'open' | 'closed';
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

export interface ChatMessageDto {
  id: string;
  conversationId: string;
  authorRole: 'user' | 'admin' | 'system';
  authorId: string | null;
  body: string;
  createdAt: string;
}

export interface SiteDemoDto {
  id: string;
  title: string;
  fromName: string | null;
  toName: string | null;
  category: string;
  lyrics: string | null;
  audioUrl: string;
  audioDurationSec: number | null;
  previewStartSec: number;
  thumbnailUrl: string | null;
}

export const api = {
  guestMe: () => request<MeGuest>('/guest-sessions/me'),
  setGuestEmail: (email: string) =>
    request<{ id: string; email: string; freeDemoUsed: boolean }>('/guest-sessions/me/email', {
      method: 'PATCH',
      body: JSON.stringify({ email }),
    }),
  authMe: () => request<MeUser | null>('/auth/me'),
  gdprRequest: (type: 'export' | 'delete', reason?: string) =>
    request<{ ok: true }>('/auth/gdpr/request', {
      method: 'POST',
      body: JSON.stringify({ type, reason }),
    }),
  requestMagicLink: (email: string) =>
    request<{ ok: true }>('/auth/magic-link/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  consumeMagicLink: (token: string) =>
    request<{ accessToken: string; userId: string }>(
      `/auth/magic-link/consume?token=${encodeURIComponent(token)}`,
    ),
  suggestMessage: (input: {
    style: string;
    occasion: string;
    recipientName: string;
    dedication?: string;
    voiceArtist?: string;
    currentDraft?: string;
    locale?: string;
  }) =>
    request<{ message: string }>('/suggestions/message', {
      method: 'POST',
      body: JSON.stringify({ locale: getCurrentLocale(), ...input }),
    }),
  createGeneration: (input: CreateGenerationInput) =>
    request<GenerationDto>('/generations', {
      method: 'POST',
      body: JSON.stringify({ locale: getCurrentLocale(), ...input }),
    }),
  getGeneration: (id: string, password?: string) =>
    request<GenerationDto>(
      `/generations/${id}`,
      {},
      password ? { 'x-unlock-password': password } : undefined,
    ),
  listGenerations: () => request<GenerationDto[]>('/generations'),
  countMyGenerations: () =>
    request<{ count: number; scope: 'user' | 'guest' | 'anonymous' }>('/generations/count/mine'),
  countTotalGenerations: () => request<{ count: number }>('/generations/count/total'),
  recentGenerations: (limit = 12) =>
    request<RecentDto[]>(`/generations/recent?limit=${limit}`),
  publicGenerations: (params: {
    style?: string;
    occasion?: string;
    voice?: string;
    period?: 'week' | 'month' | 'all';
    sort?: 'recent' | 'popular';
    limit?: number;
    offset?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    return request<{ total: number; items: (RecentDto & { viewCount: number })[] }>(
      `/generations/public${qs.toString() ? '?' + qs.toString() : ''}`,
    );
  },
  siteDemos: () =>
    request<{ items: SiteDemoDto[] }>('/public/site-demos'),
  siteDemosFeatured: () =>
    request<{ items: SiteDemoDto[] }>('/public/site-demos/featured'),
  topList: (period: 'week' | 'month' | 'all' = 'week', limit = 5) =>
    request<{
      source: 'seed' | 'live' | 'template';
      items:
        | null
        | Array<{
            rk: number;
            id: string;
            ttl: string;
            by: string;
            pl: string;
            playsRaw: number;
            voice: string;
            style: string;
            occasion: string;
            /** Prezent pentru 'live' și 'template' — permite redare în top. */
            audioUrl?: string | null;
            /** Secunda de pornire (template). */
            startSec?: number;
            /** Limită preview în secunde de la startSec; 0/absent = melodia întreagă. */
            previewSec?: number;
          }>;
    }>(`/public/top?period=${period}&limit=${limit}`),
  retryGeneration: (id: string) =>
    request<GenerationDto>(`/generations/${id}/retry`, { method: 'POST' }),
  unlockGeneration: (id: string, paymentId: string) =>
    request<GenerationDto>(`/generations/${id}/unlock`, {
      method: 'POST',
      body: JSON.stringify({ paymentId }),
    }),
  unlockGenerationWithGift: (id: string, code: string) =>
    request<GenerationDto>(`/generations/${id}/unlock-with-gift`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  priceQuote: (packageTier: PackageTier) =>
    request<PriceQuote>(`/payments/quote?packageTier=${packageTier}`),
  getPayment: (id: string) =>
    request<{ id: string; status: string; amount: number; currency: string }>(`/payments/${id}`),
  createCheckoutSession: (input: {
    generationId?: string;
    tipAmount?: number;
    premium?: boolean;
    promoCode?: string;
    /** Override email destinație. Dacă lipsește, backend-ul îl rezolvă din
     *  contul logat / guest-ul curent. */
    email?: string;
  }) =>
    request<{ url: string; paymentId: string }>('/payments/checkout-session', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  /** Pay-first checkout — folosit când site.demoEnabled=false. Userul plătește
   *  înainte de generare; webhook-ul Stripe pornește generation după paid. */
  createDirectCheckoutSession: (input: {
    generation: {
      style: string;
      occasion: string;
      recipientName: string;
      message: string;
      dedication?: string;
      voiceArtist: string;
      customLyrics?: string;
      locale?: string;
      packageTier: PackageTier;
    };
    promoCode?: string;
    /** Override email destinație. Dacă lipsește, backend-ul îl rezolvă din
     *  contul logat / guest-ul curent. */
    email?: string;
  }) =>
    request<{ url: string; paymentId: string; generationId: string }>(
      '/payments/checkout-direct',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),

  /** Selectează una dintre variantele de poză de share (plus/premium). */
  selectSocialImage: (genId: string, url: string) =>
    request<GenerationDto>(`/generations/${genId}/social-image/select`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  /** Încarcă o poză proprie de share (multipart). */
  uploadSocialImage: async (genId: string, file: File): Promise<GenerationDto> => {
    const headers = new Headers();
    headers.set('X-Locale', getCurrentLocale());
    const guestId = getGuestId();
    if (guestId) headers.set('X-Guest-Id', guestId);
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (typeof window !== 'undefined') {
      const orSid = window.__OR_SESSION_ID__;
      if (orSid) headers.set('X-OpenReplay-SessionID', orSid);
    }
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_URL}/api/generations/${genId}/social-image/upload`, {
      method: 'POST',
      headers,
      body: form,
    });
    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }
      throw new ApiError(res.status, body);
    }
    return (await res.json()) as GenerationDto;
  },

  /**
   * Creează un colaj video din imagini încărcate de user, peste una dintre
   * cele 2 melodii (`main`/`bonus`). Multipart cu câmpul `images` (≤15 fișiere)
   * + `track` în body. Lăsăm browserul să seteze Content-Type (cu boundary).
   * Folosește același pattern de auth ca `uploadSocialImage`.
   */
  createCollage: async (
    generationId: string,
    track: 'main' | 'bonus',
    files: File[],
    aspect: CollageAspect,
  ): Promise<{ collageId: string; status: string }> => {
    const headers = new Headers();
    headers.set('X-Locale', getCurrentLocale());
    const guestId = getGuestId();
    if (guestId) headers.set('X-Guest-Id', guestId);
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (typeof window !== 'undefined') {
      const orSid = window.__OR_SESSION_ID__;
      if (orSid) headers.set('X-OpenReplay-SessionID', orSid);
    }
    const form = new FormData();
    form.append('track', track);
    form.append('aspect', aspect);
    for (const f of files) form.append('images', f);
    const res = await fetch(`${API_URL}/api/generations/${generationId}/collage`, {
      method: 'POST',
      headers,
      body: form,
    });
    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }
      throw new ApiError(res.status, body);
    }
    return (await res.json()) as { collageId: string; status: string };
  },

  /** Întoarce ultimul colaj video pentru o generare (sau `null` dacă nu există). */
  getLatestCollage: async (
    generationId: string,
    password?: string,
  ): Promise<CollageDto | null> => {
    try {
      // Backend întoarce { collage: {...} | null } — dezambalăm aici ca să
      // potrivim tipul plat folosit de CollageSection (altfel status=undefined
      // și UI-ul de „se generează" dispare instant → revine dropzone-ul).
      const res = await request<{ collage: CollageDto | null }>(
        `/generations/${generationId}/collage/latest`,
        {},
        password ? { 'x-unlock-password': password } : undefined,
      );
      return res.collage ?? null;
    } catch (e) {
      // 404 = niciun colaj încă; degradare grațioasă pentru orice eroare.
      if (e instanceof ApiError && e.status === 404) return null;
      return null;
    }
  },

  /** Listează toate colajele/clipurile (cele mai noi primele). */
  listCollages: async (
    generationId: string,
    password?: string,
  ): Promise<CollageDto[]> => {
    try {
      const res = await request<{ collages: CollageDto[] }>(
        `/generations/${generationId}/collage/list`,
        {},
        password ? { 'x-unlock-password': password } : undefined,
      );
      return res.collages ?? [];
    } catch {
      return [];
    }
  },

  /**
   * Pornește un image→video: un singur cadru (una dintre pozele cunoscute ale
   * maneaua) animat peste o melodie (`main`/`bonus`). `imageUrl` TREBUIE să fie
   * una dintre pozele cunoscute (socialImages / socialImageSelected /
   * socialImageUploaded / `/uploads/social/<id>/vN.png`). Owner-only.
   */
  createImageVideo: async (
    generationId: string,
    args: { track: 'main' | 'bonus'; aspect: CollageAspect; imageUrl: string },
  ): Promise<{ collageId: string; status: string }> =>
    request<{ collageId: string; status: string }>(
      `/generations/${generationId}/collage/image-video`,
      { method: 'POST', body: JSON.stringify(args) },
    ),

  /** Owner setează/șterge parola de privacy. Parolă goală/null o șterge. */
  setUnlockPassword: (generationId: string, password: string | null) =>
    request<{ ok: boolean; hasPassword: boolean }>(
      `/generations/${generationId}/unlock-password`,
      { method: 'POST', body: JSON.stringify({ password }) },
    ),

  /** Verifică parola de privacy ca vizitator non-owner. */
  checkUnlock: (generationId: string, password: string) =>
    request<{ ok: boolean }>(
      `/generations/${generationId}/unlock-check`,
      { method: 'POST', body: JSON.stringify({ password }) },
    ),

  reportClientError: (input: { message: string; stack?: string; path?: string; level?: 'error' | 'warn' | 'info' }) =>
    request<{ ok: boolean }>('/errors/client', {
      method: 'POST',
      body: JSON.stringify({ ...input, source: 'web' }),
    }),

  roulettePrizes: () =>
    request<Array<{
      idx: number;
      weight: number;
      prizeKey: 'ghinion' | 'tier1' | 'tier2' | 'tier3' | 'gratis';
      kind: 'none' | 'discount';
      discountCents: number | null;
      currency: string;
    }>>('/roulette/prizes'),
  rouletteStatus: () =>
    request<{ ok: boolean; nextSpinAt?: string }>('/roulette/status'),
  rouletteSpin: (email?: string) =>
    request<{
      prizeIndex: number;
      prizeKey: 'ghinion' | 'tier1' | 'tier2' | 'tier3' | 'gratis';
      code?: string | null;
      discountCents?: number;
      currency?: string;
    }>(
      '/roulette/spin',
      {
        method: 'POST',
        body: JSON.stringify(email ? { email } : {}),
      },
    ),

  validateGift: (code: string) =>
    request<{ ok: boolean; reason?: string; tier?: 'single' | 'pack3' | 'pack10'; usesLeft?: number; validUntil?: string }>(
      '/gift-codes/validate',
      { method: 'POST', body: JSON.stringify({ code }) },
    ),
  purchaseGift: (tier: 'single' | 'pack3' | 'pack10', email: string) =>
    request<{ url: string; paymentId: string }>('/gift-codes/purchase', {
      method: 'POST',
      body: JSON.stringify({ tier, email }),
    }),
  redeemGift: (code: string) =>
    request<{ ok: boolean; reason?: string; usesLeft?: number }>('/gift-codes/redeem', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  myGifts: () =>
    request<Array<{ id: string; code: string; tier: string; usesLeft: number; totalUses: number; validUntil: string; active: boolean; createdAt: string }>>(
      '/gift-codes/mine',
    ),

  validatePromo: (code: string, email?: string, baseAmountCents?: number) =>
    request<{
      ok: boolean;
      reason?: string;
      promoCodeId?: string;
      discountType?: 'percent' | 'fixed';
      discountValue?: number;
      appliedDiscountCents?: number;
    }>('/promo/validate', {
      method: 'POST',
      body: JSON.stringify({ code, email, baseAmountCents }),
    }),

  chatMe: () =>
    request<{ conversation: ChatConversation; messages: ChatMessageDto[] }>('/chat/me'),
  chatSend: (body: string) =>
    request<ChatMessageDto>('/chat/me/messages', {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  /** Tracking best-effort: clientul a apăsat „Plătește acum" pe cardul de plată din chat. */
  chatPaymentLinkClick: (messageId: string) =>
    request<{ ok: true }>('/chat/me/payment-link-click', {
      method: 'POST',
      body: JSON.stringify({ messageId }),
    }),
};
