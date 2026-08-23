import { http } from '@/lib/http/client';

export interface SiteDto {
  id: string;
  slug: string;
  domain: string;
  name: string;
  locale: string;
  currency: string;
  basePriceCents: number;
  /** Prețul „standard" (strikethrough în vitrine, marketing). 0 = nu se afișează. */
  standardPriceCents?: number;
  /** Suprataxă fixă Manea Premium (cents). Default 2000 = 20 lei. */
  premiumExtraCents?: number;
  /** Plafonul de suprataxă dedicație (cents). Default 5000 = 50 lei. */
  tipSurchargeCapCents?: number;
  /** Procent de suprataxă din dedicație (0–100). Default 5. */
  tipSurchargePercent?: number;
  giftPriceCents: number;
  /** Override prețuri pachete (cents). Null = default PACKAGES (29,99 / 49,99 / 69,99). */
  packagePricesCents?: Partial<Record<'basic' | 'plus' | 'premium', number>> | null;
  /** Derivat din packagePricesCents + default. NU se trimite în PATCH. */
  packagePrices?: Record<'basic' | 'plus' | 'premium', number>;
  /** Preț tăiat (strikethrough) per pachet, cents. Omit cheia = fără tăiere. */
  packageCompareAtCents?: Partial<Record<'basic' | 'plus' | 'premium', number>> | null;
  brand: {
    primaryColor?: string;
    accentColor?: string;
    logoUrl?: string;
    ogImageUrl?: string;
    tagline?: string;
    faviconUrl?: string;
    /** URL absolut spre bannerul folosit în headerul email-urilor (600×200). */
    emailBannerUrl?: string;
  };
  seo: { title?: string; description?: string; keywords?: string };
  analytics: {
    ga4Id?: string;
    metaPixelId?: string;
    tiktokPixelId?: string;
    googleAdsConversionId?: string;
    googleAdsPurchaseLabel?: string;
    metaAdAccountId?: string;
    tiktokAdvertiserId?: string;
  };
  /** Token-uri server-side pentru tracking (server-only — nu apare în /public/site). */
  analyticsSecrets?: {
    ga4ApiSecret?: string;
    metaCapiToken?: string;
    metaTestEventCode?: string;
    tiktokAccessToken?: string;
    metaMarketingToken?: string;
    tiktokMarketingToken?: string;
  };
  stripe: { priceId?: string | null; productName?: string; statementDescriptor?: string };
  suno: {
    basePrompt?: string;
    stylePromptMap?: Record<string, string>;
    voiceMap?: Record<string, string>;
    lyricsLocale?: string;
    writerSystemPrompt?: string;
    writerUserTemplate?: string;
    criticSystemPrompt?: string;
    criticUserTemplate?: string;
  };
  social?: {
    instagram?: string;
    facebook?: string;
    tiktok?: string;
    youtube?: string;
    whatsapp?: string;
    phone?: string;
  };
  companyInfo?: {
    legalName?: string;
    cui?: string;
    regCom?: string;
    address?: string;
    iban?: string;
    ownerName?: string;
  };
  /**
   * Configurare facturare SmartBill. Tokenul vine mascat ca `__MASKED__` dacă e
   * setat (la fel ca secretele din mailConfig). La PATCH: trimite valoare nouă
   * pentru a-l seta, `''` pentru clear, `__MASKED__`/lipsă pentru păstrare.
   */
  smartbill?: {
    enabled?: boolean;
    email?: string;
    token?: string;
    companyVatCode?: string;
    seriesName?: string;
    paymentSeriesName?: string;
    measuringUnit?: string;
    productName?: string;
    paymentType?: string;
    useDefaultClient?: boolean;
    defaultClient?: {
      name?: string;
      vatCode?: string;
      regCom?: string;
      address?: string;
      city?: string;
      county?: string;
      country?: string;
      email?: string;
      isTaxPayer?: boolean;
    };
  };
  fromEmail: string | null;
  supportEmail: string | null;
  adminEmails: string[];
  /**
   * Configurare email per-site: provider (mailgun / smtp / null) + credențiale.
   * Secretele (mailgun.apiKey, smtp.pass) vin întotdeauna mascate de la API ca
   * `__MASKED__` dacă există valoare salvată, sau `''` dacă nu. La PATCH:
   * trimite valoarea nouă pentru a o seta, `''` pentru a o șterge, sau
   * `__MASKED__` (sau lipsa câmpului) pentru a păstra valoarea curentă.
   */
  mailConfig?: {
    provider?: 'mailgun' | 'smtp' | null;
    fromEmail?: string;
    fromName?: string;
    replyTo?: string;
    mailgun?: {
      apiKey?: string;
      domain?: string;
      region?: 'eu' | 'us';
      apiUrl?: string;
    };
    smtp?: {
      host?: string;
      port?: number;
      secure?: boolean;
      user?: string;
      pass?: string;
    };
  };
  active: boolean;
  isDefault: boolean;
  sslEnabled: boolean;
  maintenanceMode: boolean;
  hiddenMode: boolean;
  /** Mod AI chat inițial pentru conversații noi (override global). NULL = global.
   *  La schimbare se propagă pe toate conversațiile existente ale site-ului. */
  aiChatModeDefault: 'manual' | 'suggest' | 'auto' | null;
  /** Dacă true, Irina (AI) trimite proactiv salutul. Anti-spam: o singură dată
   *  per sesiune. Skip pe /m/[id]. */
  aiGreetingEnabled: boolean;
  /** Secunde de așteptare după conectare WS înainte de salut. Range 1-60. Default 5. */
  aiGreetingDelaySec: number;
  /** Dacă true, chat-ul se deschide automat la salut. Default true. */
  aiGreetingAutoOpenChat: boolean;
  /** Afișează meniul de selectare limbă în topbar. Default false (un domeniu = o limbă). */
  langSwitcherEnabled: boolean;
  maintenanceMessage: Record<string, string>;
  /** Lista IP-uri scutite de mentenanță / hidden (exact match sau prefix "192.168.*"). */
  ipWhitelist: string[];
  /** Toggle: dacă false, plata se face ÎNAINTE de generare (skip demo gratuit 30s). */
  demoEnabled: boolean;
  /** Toggle: dacă true (default), wizardul are un pas de generare/review a versurilor
   *  înainte de plată (max 5 regenerări AI + validare + rescriere fonetică Suno). */
  lyricsReviewEnabled: boolean;
  /** Motor audio: suno (implicit) sau google (Lyria 3 Pro, 2 variante în paralel). */
  musicEngine?: 'suno' | 'google';
  /** Sursa datelor pentru pagina /top: 'seed' (date demo), 'live' (agregare din
   *  generations) sau 'template' (top curat manual din mostre — vezi topTemplate). */
  topSource: 'seed' | 'live' | 'template';
  /** Top curat manual (folosit doar când topSource='template'). */
  topTemplate: SiteTopTemplateItem[];
  /** Categorii / stiluri muzicale per site (carduri /studio). */
  styles: SiteStyleEntry[];
  /** Voci / artiști per site. */
  voices: SiteVoiceEntry[];
  /** Ocazii (zile naștere, nuntă, etc.) per site. */
  occasions: SiteOccasionEntry[];
  /** Testimoniale afișate pe pagina principală. Gol = fallback la seed-data.ts. */
  testimonials: SiteTestimonialEntry[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  experienceConfig?: {
    defaultSlug: string;
    items: Record<string, ExperienceItemConfig>;
  } | null;
}

export interface ExperienceStyleOverride {
  id: string;
  em?: string;
  nm: string;
  ds?: string;
  heat?: string;
  ic?: SiteIconConfig;
  i18n?: Record<string, { nm?: string; ds?: string; heat?: string }>;
  artUrl?: string;
  sampleUrl?: string;
  sampleStartSec?: number;
  sunoPrompt?: string;
  googlePrompt?: string;
  lyricsHint?: string;
  styleWeight?: number;
  weirdnessConstraint?: number;
  negativeTags?: string;
  sunoPersonaIdMale?: string;
  sunoPersonaNameMale?: string;
  sunoPersonaIdFemale?: string;
  sunoPersonaNameFemale?: string;
  /** @deprecated persona unică veche — fallback dacă male/female lipsesc. */
  sunoPersonaId?: string;
  /** @deprecated */
  sunoPersonaName?: string;
}

export interface ExperienceOccasionOverride {
  id: string;
  em?: string;
  nm: string;
  ic?: SiteIconConfig;
  i18n?: Record<string, { nm?: string }>;
  sunoPrompt?: string;
  googlePrompt?: string;
}

export interface ExperienceVoiceOverride {
  id: string;
  nm: string;
  tg?: string;
  av?: string;
  ic?: SiteIconConfig;
  i18n?: Record<string, { nm?: string; tg?: string }>;
  sunoVoice?: string;
  gender?: 'm' | 'f';
  sunoPersonaId?: string;
  /** Perechea lui sunoPersonaId. Fără el, „Nume persona" completat în panoul de
   *  voce se pierde la copierea catalogului tenantului într-o interfață. */
  sunoPersonaName?: string;
}

export interface ExperienceCatalogConfig {
  styles?: ExperienceStyleOverride[];
  occasions?: ExperienceOccasionOverride[];
  voices?: ExperienceVoiceOverride[];
  writerSystemPrompt?: string;
  demoIds?: string[] | null;
  reactionClips?: ExperienceReactionClip[];
  /** undefined = moștenește tenantul; [] = nicio recenzie; listă = proprii. */
  testimonials?: SiteTestimonialEntry[];
}

export interface ExperienceReactionClip {
  id: string;
  platform: 'tiktok' | 'instagram';
  videoUrl: string;
  posterUrl?: string;
  audioUrl?: string;
  demoId?: string | null;
  username: string;
  caption: string;
  song: string;
  likes?: number;
  comments?: number;
  shares?: number;
  avatarUrl?: string;
  previewStartSec?: number;
}

export interface ExperienceItemConfig {
  enabled: boolean;
  utmRules: Array<{ source?: string; campaign?: string; content?: string }>;
  musicEngine?: 'suno' | 'google' | null;
  packages?: Partial<Record<'basic' | 'plus' | 'premium', {
    enabled?: boolean;
    label?: string;
    priceCents?: number;
    compareAtCents?: number | null;
    video?: boolean;
    socialImage?: boolean;
    socialImageCount?: number;
    instrumental?: boolean;
    premiumPage?: boolean;
    durationSec?: number;
    generation?: boolean;
    remakes?: number;
    collage?: boolean;
    collagePhotoLimit?: number;
    collageFullTrack?: boolean;
    greetingCard?: boolean;
    greetingClip?: boolean;
    socialPost?: boolean;
    nextSongDiscountPercent?: number;
    deliveryLabel?: string;
    features?: string[];
    upsell?: { title: string; body: string; targetTier: 'plus' | 'premium' } | null;
  }>>;
  catalog?: ExperienceCatalogConfig;
}

export interface SiteIconConfig {
  name: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface SiteStyleEntry {
  id: string;
  em: string;
  nm: string;
  ds: string;
  heat?: string;
  /** Imagine de cover pe cardul de stil (Cadou). */
  artUrl?: string;
  ic?: SiteIconConfig;
  i18n?: Record<string, { nm?: string; ds?: string; heat?: string }>;
  sunoPrompt?: string;
  googlePrompt?: string;
  lyricsHint?: string;
  /** Cât strict urmează Suno tag-urile de style (0..1). Default Suno ~0.5. */
  styleWeight?: number;
  /** Creativitate / deviere (0..1). */
  weirdnessConstraint?: number;
  /** Tag-uri de exclus (CSV). */
  negativeTags?: string;
  sunoPersonaIdMale?: string;
  sunoPersonaNameMale?: string;
  sunoPersonaIdFemale?: string;
  sunoPersonaNameFemale?: string;
  /** @deprecated persona unică veche — fallback dacă male/female lipsesc. */
  sunoPersonaId?: string;
  /** @deprecated */
  sunoPersonaName?: string;
  /** Default-uri persistate pentru „Personalizează mostra" din admin. */
  sampleDefaults?: SiteSampleDefaults;
}

/** Default-uri persistate pentru formularul „Personalizează mostra" din admin. */
export interface SiteSampleDefaults {
  recipient?: string;
  dedication?: string;
  message?: string;
  occasion?: string;
  tipAmount?: number;
  premium?: boolean;
  style?: string;
  voice?: string;
  gender?: 'm' | 'f';
  aiHint?: string;
  sunoPromptDraft?: string;
  lyrics?: string;
}

export interface SiteVoiceEntry {
  id: string;
  nm: string;
  tg: string;
  av: string;
  ic?: SiteIconConfig;
  i18n?: Record<string, { nm?: string; tg?: string }>;
  sunoVoice?: string;
  /** Sex vocal — trimis ca vocalGender ('m'|'f') la Suno. */
  gender?: 'm' | 'f';
  /** PersonaId Suno persistat. Când e setat, se aplică pe toate generările. */
  sunoPersonaId?: string;
  sunoPersonaName?: string;
  sunoPersonaSourceTaskId?: string;
  sunoPersonaSourceAudioId?: string;
  sunoPersonaCreatedAt?: string;
  /** Default-uri persistate pentru „Personalizează mostra" din admin. */
  sampleDefaults?: SiteSampleDefaults;
}

export interface SiteOccasionEntry {
  id: string;
  em: string;
  nm: string;
  ic?: SiteIconConfig;
  i18n?: Record<string, { nm?: string }>;
  sunoPrompt?: string;
  googlePrompt?: string;
}

export interface SiteTestimonialEntry {
  id: string;
  stars: number;
  quote: string;
  name: string;
  role: string;
  avatar: string;
  i18n?: Record<string, { quote?: string; name?: string; role?: string }>;
}

export interface SampleEntryDto {
  audioUrl: string;
  generatedAt: string;
  sunoTaskId?: string;
  startSec?: number;
}

/** O intrare curată manual pentru „Topul săptămânii" (topSource='template').
 *  Sursa audio e un track existent rezolvat după kind+key:
 *  'style'/'voice' → mostre suno; 'demo' → melodie din „Ascultă exemple" (site_demos). */
export interface SiteTopTemplateItem {
  kind: 'style' | 'voice' | 'demo';
  key: string;
  title: string;
  artist: string;
  views: number;
  /** Secunda de start (skip intro). Default 0. */
  startSec?: number;
  /** Limită preview în secunde de la startSec; 0/absent = melodia întreagă. */
  previewSec?: number;
}

export interface SampleStatusDto {
  key: string;
  entry: SampleEntryDto | null;
  generating: boolean;
}

export interface SamplesListDto {
  siteId: string;
  styles: SampleStatusDto[];
  voices: SampleStatusDto[];
}

/** Un track candidat returnat de Suno — userul alege unul în UI înainte ca
 *  mostra să fie persistată pe site. */
export interface SampleCandidateDto {
  audioUrl: string;
  audioId?: string;
  durationSec?: number;
  coverUrl?: string;
}

/** Răspunsul endpoint-ului /samples/generate:
 *  - reused=true ⇒ mostra deja există și nu s-a cerut regenerare → entry-ul vechi
 *  - reused=false ⇒ Suno a generat 2 piese; userul alege una via /samples/commit */
export type GenerateSampleResponse =
  | { ok: true; reused: true; entry: SampleEntryDto }
  | { ok: true; reused: false; candidates: SampleCandidateDto[]; sunoTaskId: string };

export type RolloutStatus = 'ok' | 'missing' | 'partial' | 'info';

export interface SiteRolloutCheck {
  id: string;
  title: string;
  description: string;
  group: string;
  scope: 'global' | 'site';
  autoApply: boolean;
  status: RolloutStatus;
  detail: string;
}

export interface SiteRolloutSiteRow {
  id: string;
  name: string;
  domain: string;
  locale: string;
  currency: string;
  musicEngine: 'suno' | 'google';
  active: boolean;
  missing: number;
  partial: number;
  autoFixable: number;
  checks: SiteRolloutCheck[];
}

export interface SiteRolloutOverview {
  checks: Array<Omit<SiteRolloutCheck, 'status' | 'detail'>>;
  global: SiteRolloutCheck[];
  sites: SiteRolloutSiteRow[];
  totals: { sites: number; sitesWithGaps: number; autoFixable: number };
}

export const SitesApi = {
  listExperiences: () => http.get<Array<{ slug: string; label: string }>>('/admin/experiences'),
  list: () => http.get<SiteDto[]>('/admin/sites'),
  get: (id: string) => http.get<SiteDto>(`/admin/sites/${id}`),
  create: (body: Partial<SiteDto>) => http.post<SiteDto>('/admin/sites', body),
  update: (id: string, body: Partial<SiteDto>) => http.patch<SiteDto>(`/admin/sites/${id}`, body),

  /** Registru de lansare: ce lipsește pe fiecare site față de seed-ul curent (Lyria, Cadou, etc.). */
  rolloutOverview: () => http.get<SiteRolloutOverview>(`/admin/rollout`),
  rolloutApplySite: (siteId: string, checkIds?: string[]) =>
    http.post<{ applied: string[]; skipped: string[]; site: SiteRolloutSiteRow | null }>(
      `/admin/rollout/${siteId}/apply`,
      { checkIds },
    ),
  rolloutApplyAll: (checkIds?: string[]) =>
    http.post<{ results: Array<{ applied: string[]; skipped: string[] }> }>(`/admin/rollout/apply-all`, { checkIds }),
  remove: (id: string) => http.delete<{ ok: true }>(`/admin/sites/${id}`),
  /** Upload asset brand (logo / OG / favicon / email banner). Răspunde cu URL-ul
   *  public + brand-ul actualizat (deja persistat în DB pe site). */
  uploadBrandAsset: (
    id: string,
    field: 'logoUrl' | 'ogImageUrl' | 'faviconUrl' | 'emailBannerUrl',
    file: File,
  ) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('field', field);
    return http.post<{ ok: true; url: string; brand: SiteDto['brand'] }>(
      `/admin/sites/${id}/brand/upload`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60_000 },
    );
  },
  uploadExperienceAsset: (
    id: string,
    slug: string,
    kind: 'art' | 'sample' | 'reaction',
    styleId: string,
    file: File,
  ) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', kind);
    fd.append('styleId', styleId);
    return http.post<{ ok: true; url: string }>(
      `/admin/sites/${id}/experiences/${encodeURIComponent(slug)}/upload`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60_000 },
    );
  },

  // === Mostre audio (carduri ► din /studio) ===
  listSamples: (id: string) => http.get<SamplesListDto>(`/admin/sites/${id}/samples`),
  generateSample: (
    id: string,
    body: {
      kind: 'style' | 'voice';
      key: string;
      regenerate?: boolean;
      voice?: string;
      lyrics?: string;
      customStylePrompt?: string;
      recipientName?: string;
      dedication?: string;
      style?: string;
      occasion?: string;
      message?: string;
      tipAmount?: number;
      premium?: boolean;
      vocalGender?: 'm' | 'f';
    },
  ) =>
    // Suno polling 8 min + writer + critic OpenAI (~1 min total) = până la 10 min.
    // Lăsăm 12 min buffer.
    http.post<GenerateSampleResponse>(
      `/admin/sites/${id}/samples/generate`,
      body,
      { timeout: 12 * 60_000 },
    ),
  /** Finalizează o generare: userul a ales un track din cele 2 candidate.
   *  Backend-ul descarcă mp3-ul ales pe disc și salvează entry-ul atomic. */
  commitSampleChoice: (
    id: string,
    body: {
      kind: 'style' | 'voice';
      key: string;
      audioUrl: string;
      audioId?: string;
      sunoTaskId: string;
      durationSec?: number;
    },
  ) =>
    http.post<{ ok: true; entry: SampleEntryDto }>(
      `/admin/sites/${id}/samples/commit`,
      body,
      { timeout: 60_000 },
    ),
  previewSampleLyrics: (
    id: string,
    body: {
      kind: 'style' | 'voice';
      key: string;
      voice?: string;
      recipientName?: string;
      customStylePrompt?: string;
      dedication?: string;
      style?: string;
      occasion?: string;
      message?: string;
      tipAmount?: number;
    },
  ) =>
    // OpenAI lyrics writer + critic pot dura 30-60s. Bump la 90s.
    http.post<{ lyrics: string }>(`/admin/sites/${id}/samples/preview-lyrics`, body, {
      timeout: 90_000,
    }),
  generateAllSamples: (id: string, body: { regenerate?: boolean } = {}) =>
    http.post<{ ok: true; queued: Array<{ kind: 'style' | 'voice'; key: string }>; count: number }>(
      `/admin/sites/${id}/samples/generate-all`,
      body,
    ),
  /** Upload manual MP3/WAV/M4A/OGG ca mostră — fără să consume credit Suno. */
  uploadSample: (id: string, kind: 'style' | 'voice', key: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', kind);
    fd.append('key', key);
    return http.post<{ ok: true; entry: SampleEntryDto }>(`/admin/sites/${id}/samples/upload`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60_000,
    });
  },
  /** Actualizează secunda de start (skip intro) pentru o mostră existentă. */
  updateSampleStartSec: (
    id: string,
    body: { kind: 'style' | 'voice'; key: string; startSec: number },
  ) =>
    http.patch<{ ok: true; entry: SampleEntryDto }>(
      `/admin/sites/${id}/samples/start-sec`,
      body,
    ),
  /** Șterge toate mostrele audio (fișiere MP3 + intrările din DB). */
  clearAllSamples: (id: string) =>
    http.delete<{ ok: true; deleted: number }>(`/admin/sites/${id}/samples`),
  /** Generează un Persona Suno pentru o voce. Folosește mostra audio existentă
   *  a vocii (cere taskId + audioId persistate la generare). Răspunde cu vocea
   *  actualizată (conține sunoPersonaId). */
  generatePersona: (
    id: string,
    voiceId: string,
    body: { name?: string; description?: string; vocalStart?: number; vocalEnd?: number; style?: string } = {},
  ) =>
    http.post<{ ok: true; voice: any }>(`/admin/sites/${id}/samples/voices/${voiceId}/generate-persona`, body, {
      timeout: 60_000,
    }),
};

const STORAGE_KEY = 'mc_admin_site';
export const ALL_SITES = 'all';

export function getSelectedSiteId(): string {
  if (typeof window === 'undefined') return ALL_SITES;
  return window.localStorage.getItem(STORAGE_KEY) || ALL_SITES;
}

export function setSelectedSiteId(id: string): void {
  if (typeof window === 'undefined') return;
  if (id) window.localStorage.setItem(STORAGE_KEY, id);
  else window.localStorage.removeItem(STORAGE_KEY);
  // semnalizează altora
  window.dispatchEvent(new CustomEvent('mc:site-changed', { detail: id }));
}
