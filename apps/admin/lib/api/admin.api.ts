import { http } from '../http/client';
import type {
  AdminError,
  AdminGeneration,
  AdminGiftCode,
  AdminGuest,
  AdminPayment,
  AdminPromoCode,
  AdminStats,
  AdminUser,
} from '../types';

export interface OrderDetailTimelineEvent {
  at: string;
  kind: string;
  title: string;
  detail?: string;
  data?: Record<string, unknown>;
}

export interface OrderDetail {
  payment: {
    id: string;
    siteId: string | null;
    provider: string;
    providerSessionId: string | null;
    amount: number;
    currency: string;
    status: string;
    amountRonCents: number | null;
    exchangeRateToRon: string | null;
    failureReason: string | null;
    failureCode: string | null;
    userId: string | null;
    guestId: string | null;
    openReplaySessionId: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  generation: {
    id: string;
    siteId: string | null;
    type: 'demo' | 'full';
    status: string;
    durationSec: number;
    style: string;
    occasion: string;
    recipientName: string;
    recipientGender: 'M' | 'F' | null;
    dedicatorName: string | null;
    message: string;
    dedication: string | null;
    voiceArtist: string;
    customLyrics: string | null;
    lyricsDraft: string | null;
    lyrics: string | null;
    tipAmount: number;
    premium: boolean;
    /** Pachetul ales (model nou cu 3 pachete). Lipsește la comenzile legacy. */
    packageTier?: 'basic' | 'plus' | 'premium';
    /** Imagini social generate pentru livrabile. */
    socialImages?: string[];
    /** Imaginea social selectată de client. */
    socialImageSelected?: string | null;
    /** Imaginea social încărcată manual. */
    socialImageUploaded?: string | null;
    /** URL piesă instrumentală (livrabil pachet). */
    instrumentalUrl?: string | null;
    /** URL videoclip (livrabil pachet). */
    videoUrl?: string | null;
    paymentId: string | null;
    paidUnlocked: boolean;
    audioUrl: string | null;
    bonusAudioUrl: string | null;
    demoAudioUrl: string | null;
    demoBonusAudioUrl: string | null;
    coverUrl: string | null;
    tracks: Array<{ audioUrl: string; durationSec: number; coverUrl?: string }> | null;
    providerJobId: string | null;
    retryCount: number;
    nextRetryAt: string | null;
    lastRetryAt: string | null;
    error: string | null;
    viewCount: number;
    locale: string;
    inferredFromChat: boolean;
    inferenceMeta: Record<string, unknown> | null;
    openReplaySessionId: string | null;
    createdAt: string;
    completedAt: string | null;
  } | null;
  owner: {
    kind: 'user' | 'guest' | 'anonymous';
    id: string | null;
    email: string | null;
    name: string | null;
    role: string | null;
    freeDemoUsed: boolean | null;
    createdAt: string | null;
  };
  site: {
    id: string;
    name: string;
    domain: string;
    slug: string;
    locale: string;
    currency: string;
  } | null;
  analytics: {
    session: {
      sessionKey: string;
      country: string | null;
      countryName: string | null;
      city: string | null;
      ip: string | null;
      device: string | null;
      browserName: string | null;
      browserVersion: string | null;
      osName: string | null;
      source: string | null;
      medium: string | null;
      campaign: string | null;
      referrer: string | null;
      landingPath: string | null;
      pageViews: number;
      durationSec: number;
      isBot: boolean;
    } | null;
    events: Array<{
      id: string;
      type: string;
      createdAt: string;
      props: Record<string, unknown> | null;
    }>;
  };
  sunoLogs: Array<{
    id: string;
    requestType: string;
    endpoint: string;
    responseStatus: number | null;
    providerStatus: string | null;
    outcome: string;
    taskId: string | null;
    errorMessage: string | null;
    costCredits: string;
    requestBody: Record<string, unknown>;
    responseBody: unknown;
    createdAt: string;
    completedAt: string | null;
  }>;
  lyricsLogs: Array<{
    id: string;
    stage: string;
    model: string | null;
    locale: string | null;
    outcome: string;
    responseStatus: number | null;
    responseContent: string | null;
    systemPrompt: string;
    userPrompt: string;
    tokensPrompt: number | null;
    tokensCompletion: number | null;
    tokensTotal: number | null;
    durationMs: number | null;
    errorMessage: string | null;
    createdAt: string;
    completedAt: string | null;
  }>;
  outboundEmails: Array<{
    id: string;
    kind: string | null;
    status: string;
    to: string;
    fromAddress: string | null;
    subject: string;
    text: string | null;
    html: string | null;
    provider: string | null;
    providerMessageId: string | null;
    errorMessage: string | null;
    relatedId: string | null;
    createdAt: string;
    finalizedAt: string | null;
  }>;
  chat: {
    /** Cum am legat conversația de comandă:
     *  - wizard_gen: wizardState.generationId == gen.id (cel mai sigur)
     *  - wizard_payment: wizardState.paymentId == payment.id
     *  - message_payload: găsit prin payload de mesaj (payment_link / song_preview)
     *  - recent_fallback: cea mai recentă conv a user/guest (NU garantat legată!) */
    linkType: 'wizard_gen' | 'wizard_payment' | 'message_payload' | 'recent_fallback' | null;
    conversation: {
      id: string;
      subject: string;
      status: string;
      aiMode: string;
      wizardState: Record<string, unknown> | null;
      assignedAdminEmail: string | null;
      greetingSentAt: string | null;
      createdAt: string;
      updatedAt: string;
      lastMessageAt: string | null;
    };
    messages: Array<{
      id: string;
      authorRole: 'user' | 'admin' | 'system';
      body: string;
      detectedLang: string | null;
      bodyRo: string | null;
      messageType: string;
      payload: Record<string, unknown> | null;
      attachmentUrl: string | null;
      attachmentName: string | null;
      attachmentMime: string | null;
      deliveredAt: string | null;
      readAt: string | null;
      aiGenerated: boolean;
      createdAt: string;
    }>;
    aiToolCalls: Array<{
      id: string;
      toolName: string;
      aiMode: string;
      model: string | null;
      totalPromptTokens: number | null;
      totalCompletionTokens: number | null;
      requiredApproval: boolean;
      input: Record<string, unknown> | null;
      output: Record<string, unknown> | null;
      error: string | null;
      createdAt: string;
    }>;
  } | null;
  timeline: OrderDetailTimelineEvent[];
  timings: {
    orderToPaymentMs: number | null;
    paymentInitToPaidMs: number | null;
    orderToCompletedMs: number | null;
    lyricsTotalMs: number | null;
  };
}

export class AdminApi {
  static stats(): Promise<AdminStats> { return http.get('/admin/stats'); }
  static users(): Promise<AdminUser[]> { return http.get('/admin/users'); }
  static guests(): Promise<AdminGuest[]> { return http.get('/admin/guests'); }
  static generations(): Promise<AdminGeneration[]> { return http.get('/admin/generations'); }
  static payments(params: {
    limit?: number;
    offset?: number;
    status?: string;
    source?: string;
    search?: string;
    from?: string;
    to?: string;
  } = {}): Promise<{ items: AdminPayment[]; total: number }> {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    const q = qs.toString();
    return http.get(`/admin/payments${q ? `?${q}` : ''}`);
  }
  static runSeeder(): Promise<{ users: number; generations: number; conversations: number }> {
    return http.post('/admin/seeder/run');
  }
  static userSetRole(id: string, role: 'user' | 'admin'): Promise<unknown> {
    return http.patch(`/admin/users/${id}/role`, { role });
  }
  static userResetDemo(id: string): Promise<unknown> {
    return http.post(`/admin/users/${id}/reset-demo`);
  }
  static generationForceUnlock(id: string): Promise<unknown> {
    return http.post(`/admin/generations/${id}/force-unlock`);
  }
  static generationDelete(id: string): Promise<unknown> {
    return http.delete(`/admin/generations/${id}`);
  }
  static generationRetry(id: string): Promise<{ ok: boolean; status: string; retryCount: number }> {
    return http.post(`/admin/generations/${id}/retry`);
  }
  static generationManualUpload(
    id: string,
    main: File,
    bonus: File | null,
  ): Promise<{ ok: boolean; status: string; audioUrl: string; bonusAudioUrl: string | null }> {
    const fd = new FormData();
    fd.append('main', main);
    if (bonus) fd.append('bonus', bonus);
    return http.post(`/admin/generations/${id}/manual-upload`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
    });
  }
  static paymentStripeDetails(id: string): Promise<{
    name: string | null;
    email: string | null;
    phone: string | null;
    address: {
      line1: string | null;
      line2: string | null;
      city: string | null;
      state: string | null;
      postalCode: string | null;
      country: string | null;
    } | null;
    paymentMethod: {
      brand: string | null;
      last4: string | null;
      expMonth: number | null;
      expYear: number | null;
      country: string | null;
    } | null;
  } | null> {
    return http.get(`/admin/payments/${id}/stripe-details`);
  }
  static orderDetail(id: string): Promise<OrderDetail> {
    return http.get(`/admin/orders/${id}`);
  }
  static paymentRefund(
    id: string,
    body: { amountCents?: number; reason?: string } = {},
  ): Promise<
    | { ok: true; refundId: string; amountCents: number }
    | { ok: false; error: string }
  > {
    return http.post(`/admin/payments/${id}/refund`, body);
  }
}

// ============== SEO Pages ==============

export interface AdminSeoPage {
  id: string;
  siteId: string;
  slug: string;
  /** Slug în limba site-ului. Pentru RO sau pagini ne-regenerate poate fi null/egal cu slug. */
  localizedSlug?: string | null;
  category: string;
  locale: string;
  title: string;
  metaDescription: string;
  h1: string;
  excerpt: string | null;
  contentMd: string;
  source: 'ai' | 'manual';
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SeoBulkJob {
  status: 'running' | 'done' | 'error';
  total: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: string[];
  startedAt: number;
  endedAt?: number;
  errorMessage?: string;
}

export interface SeoSlugTemplate {
  slug: string;
  category: string;
  primaryKeyword: string;
  intent: string;
}

export class SeoPagesApi {
  static list(): Promise<AdminSeoPage[]> {
    return http.get('/admin/seo-pages');
  }
  static templates(): Promise<SeoSlugTemplate[]> {
    return http.get('/admin/seo-pages/templates');
  }
  static regenerateAll(opts: { regenerate?: boolean } = {}): Promise<SeoBulkJob> {
    // Endpoint-ul răspunde 202 imediat — job-ul rulează în background pe API.
    return http.post('/admin/seo-pages/regenerate-all', opts);
  }
  static regenerateStatus(): Promise<SeoBulkJob | { status: 'idle' }> {
    return http.get('/admin/seo-pages/regenerate-status');
  }
  static regenerateOne(slug: string): Promise<AdminSeoPage> {
    return http.post(`/admin/seo-pages/${slug}/regenerate`);
  }
  static update(
    id: string,
    patch: Partial<Pick<AdminSeoPage, 'title' | 'metaDescription' | 'h1' | 'excerpt' | 'contentMd' | 'published'>>,
  ): Promise<AdminSeoPage> {
    return http.patch(`/admin/seo-pages/${id}`, patch);
  }
  static delete(id: string): Promise<{ ok: boolean }> {
    return http.delete(`/admin/seo-pages/${id}`);
  }
}

export class PromoApi {
  static list(): Promise<AdminPromoCode[]> { return http.get('/admin/promo'); }
  static create(input: {
    code?: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
    validUntil?: string;
    maxUses?: number;
    restrictedToEmail?: string;
    note?: string;
  }): Promise<AdminPromoCode> {
    return http.post('/admin/promo', input);
  }
  static setActive(id: string, active: boolean): Promise<AdminPromoCode> {
    return http.patch(`/admin/promo/${id}/active`, { active });
  }
  static update(
    id: string,
    patch: {
      code?: string;
      discountType?: 'percent' | 'fixed';
      discountValue?: number;
      validFrom?: string | null;
      validUntil?: string | null;
      maxUses?: number;
      restrictedToEmail?: string | null;
      note?: string | null;
      active?: boolean;
    },
  ): Promise<AdminPromoCode> {
    return http.patch(`/admin/promo/${id}`, patch);
  }
  static delete(id: string): Promise<{ ok: true }> {
    return http.delete(`/admin/promo/${id}`);
  }
}

export class ErrorsApi {
  static list(params: { level?: string; source?: string; resolved?: 'true' | 'false'; limit?: number } = {}): Promise<AdminError[]> {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    return http.get(`/admin/errors${qs.toString() ? '?' + qs.toString() : ''}`);
  }
  static stats(): Promise<{ last24h: Record<string, number>; unresolved: number }> {
    return http.get('/admin/errors/stats');
  }
  static resolve(id: string): Promise<unknown> {
    return http.patch(`/admin/errors/${id}/resolve`);
  }
  static resolveAll(): Promise<{ ok: boolean; affected: number }> {
    return http.patch('/admin/errors/resolve-all');
  }
  static clear(onlyResolved = false): Promise<{ ok: boolean; affected: number }> {
    return http.delete(`/admin/errors${onlyResolved ? '?onlyResolved=true' : ''}`);
  }
}

export class GiftCodesApi {
  static list(): Promise<AdminGiftCode[]> { return http.get('/admin/gift-codes'); }
  static setActive(id: string, active: boolean): Promise<unknown> {
    return http.patch(`/admin/gift-codes/${id}/active`, { active });
  }
  static extend(id: string, days: number): Promise<unknown> {
    return http.patch(`/admin/gift-codes/${id}/extend`, { days });
  }
}
