'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:1501';
const GUEST_KEY = 'mc_guest_id';
const TOKEN_KEY = 'mc_access_token';

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
  if (typeof document !== 'undefined') {
    const m = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  return process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'ro';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('X-Locale', getCurrentLocale());

  const guestId = getGuestId();
  if (guestId) headers.set('X-Guest-Id', guestId);

  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

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
}

export interface RecentDto {
  id: string;
  style: string;
  occasion: string;
  recipientName: string;
  voiceArtist: string;
  audioUrl: string | null;
  coverUrl: string | null;
  createdAt: string;
}

export interface PriceQuote {
  base: number;
  tipAmount: number;
  tipSurcharge: number;
  premiumExtra: number;
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
  getGeneration: (id: string) => request<GenerationDto>(`/generations/${id}`),
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
  priceQuote: (tipAmount: number, premium: boolean) =>
    request<PriceQuote>(
      `/payments/quote?tipAmount=${tipAmount}&premium=${premium ? 'true' : 'false'}`,
    ),
  getPayment: (id: string) =>
    request<{ id: string; status: string; amount: number; currency: string }>(`/payments/${id}`),
  createCheckoutSession: (input: {
    generationId?: string;
    tipAmount?: number;
    premium?: boolean;
    promoCode?: string;
  }) =>
    request<{ url: string; paymentId: string }>('/payments/checkout-session', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  reportClientError: (input: { message: string; stack?: string; path?: string; level?: 'error' | 'warn' | 'info' }) =>
    request<{ ok: boolean }>('/errors/client', {
      method: 'POST',
      body: JSON.stringify({ ...input, source: 'web' }),
    }),

  roulettePrizes: () =>
    request<Array<{ idx: number; weight: number; label: string; kind: 'none' | 'discount' }>>(
      '/roulette/prizes',
    ),
  rouletteStatus: () =>
    request<{ ok: boolean; nextSpinAt?: string }>('/roulette/status'),
  rouletteSpin: (email?: string) =>
    request<{ prizeIndex: number; prizeLabel: string; code?: string | null; discountCents?: number }>(
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
};
