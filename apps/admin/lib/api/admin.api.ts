import { http } from '../http/client';
import type {
  AdminError,
  AdminGeneration,
  AdminGuest,
  AdminPayment,
  AdminPromoCode,
  AdminStats,
  AdminStatsRange,
  AdminUser,
} from '../types';

export interface GenerationMediaExtras {
  wavUrl?: string;
  wavBonusUrl?: string;
  vocalUrl?: string;
  accompanimentUrl?: string;
  stems?: Record<string, string>;
  musicVideoUrl?: string;
  musicVideoBonusUrl?: string;
}

/** O variație (rând-copil) a unei comenzi — re-roll/regenerare/extend/cover. */
export interface AdminVariation {
  id: string;
  parentGenerationId: string | null;
  variationLabel: string | null;
  status: string;
  style: string;
  voiceArtist: string;
  recipientName: string;
  audioUrl: string | null;
  demoAudioUrl: string | null;
  bonusAudioUrl: string | null;
  coverUrl: string | null;
  error: string | null;
  sortOrder: number;
  createdAt: string;
  completedAt: string | null;
}

/** Un colaj video (slideshow din poze) sau image_video (o poză) al unei comenzi. */
export interface AdminCollage {
  id: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  videoUrl: string | null;
  track: string;
  kind: 'collage' | 'image_video';
  aspect: string;
  imageCount: number;
  error: string | null;
  sourceImageUrl: string | null;
  /** URL-urile imaginilor sursă încărcate (doar pentru kind='collage'). */
  images: string[];
  createdAt: string;
  completedAt: string | null;
}

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
    /** PIN/parola de partajare a conținutului privat (4 cifre, în clar din DB). */
    unlockPin?: string | null;
    /** True dacă owner-ul a setat o parolă pentru conținutul privat. */
    hasUnlockPassword?: boolean;
    audioUrl: string | null;
    bonusAudioUrl: string | null;
    demoAudioUrl: string | null;
    demoBonusAudioUrl: string | null;
    coverUrl: string | null;
    tracks: Array<{ audioUrl: string; durationSec: number; coverUrl?: string; audioId?: string }> | null;
    videoUrlBonus?: string | null;
    parentGenerationId?: string | null;
    variationLabel?: string | null;
    mediaExtras?: GenerationMediaExtras | null;
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
  /** `experience` = slug de interfață (classic/cadou); `all` sau lipsă = toate. */
  static generations(params: { experience?: string } = {}): Promise<AdminGeneration[]> {
    const qs = new URLSearchParams();
    if (params.experience && params.experience !== 'all') qs.set('experience', params.experience);
    const q = qs.toString();
    return http.get(`/admin/generations${q ? `?${q}` : ''}`);
  }
  static payments(params: {
    limit?: number;
    offset?: number;
    status?: string;
    source?: string;
    search?: string;
    from?: string;
    to?: string;
    /** Slug de interfață (classic/cadou); `all` = fără filtru. */
    experience?: string;
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
  /** Creare user din admin (inclusiv admini). siteId obligatoriu — userii sunt unici pe (siteId, email). */
  static userCreate(body: { email: string; name?: string; role: 'user' | 'admin'; siteId: string }): Promise<AdminUser> {
    return http.post('/admin/users', body);
  }
  static userResetDemo(id: string): Promise<unknown> {
    return http.post(`/admin/users/${id}/reset-demo`);
  }
  /** KPI + serii zilnice pe interval pentru dashboard (sume normalizate RON, fără plățile echipei). */
  static statsRange(range: { from: string; to: string }): Promise<AdminStatsRange> {
    return http.get(`/admin/stats/range?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`);
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

  // ============== Colaj video (poze client + generare/regenerare din admin) ==
  /** Toate colajele unei comenzi + imaginile sursă încărcate de client. */
  static generationCollages(id: string): Promise<{ collages: AdminCollage[] }> {
    return http.get(`/admin/generations/${id}/collages`);
  }
  /** Admin încarcă imagini proprii și pornește un colaj nou (max 15, ≤10MB). */
  static generationCreateCollage(
    id: string,
    files: File[],
    track: 'main' | 'bonus',
    aspect: string,
  ): Promise<{ collageId: string; status: string }> {
    const fd = new FormData();
    fd.append('track', track);
    fd.append('aspect', aspect);
    for (const f of files) fd.append('images', f);
    return http.post(`/admin/generations/${id}/collage`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
    });
  }
  /** Regenerează un colaj (aceleași poze, altă variantă) sau reface image_video. */
  static generationRegenerateCollage(
    id: string,
    collageId: string,
    opts?: { track?: 'main' | 'bonus'; aspect?: string },
  ): Promise<{ collageId: string; status: string }> {
    return http.post(`/admin/generations/${id}/collage/${collageId}/regenerate`, opts ?? {});
  }

  // ============== Regenerare + variații + unelte Suno ==============
  static generationRegenerate(
    id: string,
    body: {
      target: 'overwrite' | 'new_track' | 'new_order';
      lyricsMode?: 'rewrite' | 'keep' | 'custom';
      customLyrics?: string;
      label?: string;
      edits?: {
        recipientName?: string;
        dedication?: string | null;
        message?: string;
        style?: string;
        occasion?: string;
        voiceArtist?: string;
        packageTier?: string;
      };
    },
  ): Promise<{ ok: boolean; id: string; status: string; parentGenerationId: string | null }> {
    return http.post(`/admin/generations/${id}/regenerate`, body, { timeout: 30_000 });
  }
  static generationReroll(id: string): Promise<{ ok: boolean; id: string; status: string }> {
    return http.post(`/admin/generations/${id}/reroll`);
  }
  /**
   * Setează direct tipul (demo|normal) și/sau pachetul (basic|plus|premium) al
   * comenzii, fără regenerare. Pentru full, generează doar livrabilele lipsă.
   */
  static generationSetPackaging(
    id: string,
    body: { type?: 'demo' | 'full'; tier?: 'basic' | 'plus' | 'premium' },
  ): Promise<{
    ok: boolean;
    id: string;
    type: 'demo' | 'full';
    packageTier: string;
    deliverablesQueued: boolean;
  }> {
    return http.post(`/admin/generations/${id}/packaging`, body);
  }
  static generationSwapTracks(
    id: string,
  ): Promise<{ ok: boolean; audioUrl: string | null; bonusAudioUrl: string | null }> {
    return http.post(`/admin/generations/${id}/swap-tracks`);
  }
  static generationVariations(id: string): Promise<AdminVariation[]> {
    return http.get(`/admin/generations/${id}/variations`);
  }
  /** Upload manual al unui MP3 ca variație nouă (oricâte). Nu atinge piesa live. */
  static generationManualUploadVariation(
    id: string,
    file: File,
    label?: string,
  ): Promise<{ ok: boolean; id: string; status: string; audioUrl: string | null; variationLabel: string | null }> {
    const fd = new FormData();
    fd.append('file', file);
    if (label) fd.append('label', label);
    return http.post(`/admin/generations/${id}/manual-upload-variation`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
    });
  }
  /** Re-trimite emailul de livrare („melodia ta e gata") către client. */
  static generationResendEmail(id: string): Promise<{ ok: boolean }> {
    return http.post(`/admin/generations/${id}/resend-email`);
  }
  /** Scoate de pe pagina clientului piesa principală (`main`) sau bonusul (`bonus`). */
  static generationClearSlot(
    id: string,
    slot: 'main' | 'bonus',
  ): Promise<{ ok: boolean; id: string; audioUrl: string | null; bonusAudioUrl: string | null }> {
    return http.post(`/admin/generations/${id}/clear-slot`, { slot });
  }
  static generationPromote(
    variationId: string,
    body: { slot: 'main' | 'bonus'; notify?: boolean },
  ): Promise<{ ok: boolean; id: string }> {
    return http.post(`/admin/generations/${variationId}/promote`, body);
  }
  static generationDeleteVariation(id: string): Promise<{ ok: boolean }> {
    return http.delete(`/admin/generations/${id}/variation`);
  }
  static generationReorderVariations(
    rootId: string,
    ids: string[],
  ): Promise<{ ok: boolean }> {
    return http.post(`/admin/generations/${rootId}/reorder-variations`, { ids });
  }
  static generationExtend(
    id: string,
    body: { slot?: 'main' | 'bonus'; continueAt?: number; style?: string },
  ): Promise<{ ok: boolean; id: string; status: string }> {
    return http.post(`/admin/generations/${id}/extend`, body);
  }
  static generationCover(
    id: string,
    body: { slot?: 'main' | 'bonus'; style?: string; instrumental?: boolean; label?: string },
  ): Promise<{ ok: boolean; id: string; status: string }> {
    return http.post(`/admin/generations/${id}/cover`, body);
  }
  static generationReplaceSection(
    id: string,
    body: {
      slot?: 'main' | 'bonus';
      infillStartS?: number;
      infillEndS?: number;
      autoChorus?: boolean;
      style?: string;
      prompt?: string;
    },
  ): Promise<{ ok: boolean; id: string; status: string }> {
    return http.post(`/admin/generations/${id}/replace-section`, body);
  }
  static generationWav(id: string, slot: 'main' | 'bonus' = 'main'): Promise<{ ok: true }> {
    return http.post(`/admin/generations/${id}/wav`, { slot });
  }
  static generationSeparateVocals(
    id: string,
    slot: 'main' | 'bonus' = 'main',
    type: 'separate_vocal' | 'split_stem' = 'separate_vocal',
  ): Promise<{ ok: true }> {
    return http.post(`/admin/generations/${id}/separate-vocals`, { slot, type });
  }
  static generationMusicVideo(id: string, slot: 'main' | 'bonus' = 'main'): Promise<{ ok: true }> {
    return http.post(`/admin/generations/${id}/music-video`, { slot });
  }
  static sunoCredits(): Promise<{ credits: number | null }> {
    return http.get('/admin/suno/credits');
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
  /** Marchează plata ca 'refunded' doar ca status (fără Stripe, fără storno). */
  static paymentMarkRefunded(
    id: string,
    body: { reason?: string } = {},
  ): Promise<{ ok: true; status: 'refunded' } | { ok: false; error: string }> {
    return http.post(`/admin/payments/${id}/mark-refunded`, body);
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

