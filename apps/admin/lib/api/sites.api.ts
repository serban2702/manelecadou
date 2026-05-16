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
  brand: {
    primaryColor?: string;
    accentColor?: string;
    logoUrl?: string;
    ogImageUrl?: string;
    tagline?: string;
    faviconUrl?: string;
  };
  seo: { title?: string; description?: string; keywords?: string };
  analytics: { ga4Id?: string; metaPixelId?: string; tiktokPixelId?: string };
  /** Token-uri server-side pentru tracking (server-only — nu apare în /public/site). */
  analyticsSecrets?: {
    ga4ApiSecret?: string;
    metaCapiToken?: string;
    tiktokAccessToken?: string;
  };
  stripe: { priceId?: string | null; productName?: string; statementDescriptor?: string };
  suno: {
    basePrompt?: string;
    stylePromptMap?: Record<string, string>;
    voiceMap?: Record<string, string>;
    lyricsLocale?: string;
    writerSystemPrompt?: string;
    criticSystemPrompt?: string;
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
  fromEmail: string | null;
  supportEmail: string | null;
  adminEmails: string[];
  active: boolean;
  isDefault: boolean;
  sslEnabled: boolean;
  maintenanceMode: boolean;
  hiddenMode: boolean;
  maintenanceMessage: Record<string, string>;
  /** Lista IP-uri scutite de mentenanță / hidden (exact match sau prefix "192.168.*"). */
  ipWhitelist: string[];
  /** Toggle: dacă false, plata se face ÎNAINTE de generare (skip demo gratuit 30s). */
  demoEnabled: boolean;
  /** Categorii / stiluri muzicale per site (carduri /studio). */
  styles: SiteStyleEntry[];
  /** Voci / artiști per site. */
  voices: SiteVoiceEntry[];
  /** Ocazii (zile naștere, nuntă, etc.) per site. */
  occasions: SiteOccasionEntry[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
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
  ic?: SiteIconConfig;
  i18n?: Record<string, { nm?: string; ds?: string; heat?: string }>;
  sunoPrompt?: string;
  lyricsHint?: string;
  /** Cât strict urmează Suno tag-urile de style (0..1). Default Suno ~0.5. */
  styleWeight?: number;
  /** Creativitate / deviere (0..1). */
  weirdnessConstraint?: number;
  /** Tag-uri de exclus (CSV). */
  negativeTags?: string;
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
}

export interface SiteOccasionEntry {
  id: string;
  em: string;
  nm: string;
  ic?: SiteIconConfig;
  i18n?: Record<string, { nm?: string }>;
}

export interface SampleEntryDto {
  audioUrl: string;
  generatedAt: string;
  sunoTaskId?: string;
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

export const SitesApi = {
  list: () => http.get<SiteDto[]>('/admin/sites'),
  get: (id: string) => http.get<SiteDto>(`/admin/sites/${id}`),
  create: (body: Partial<SiteDto>) => http.post<SiteDto>('/admin/sites', body),
  update: (id: string, body: Partial<SiteDto>) => http.patch<SiteDto>(`/admin/sites/${id}`, body),
  remove: (id: string) => http.delete<{ ok: true }>(`/admin/sites/${id}`),

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
    },
  ) =>
    // Suno polling takes up to 6 min — overriding default 30s timeout. 8 min ca să avem buffer.
    http.post<{ ok: true; entry: SampleEntryDto; reused: boolean }>(
      `/admin/sites/${id}/samples/generate`,
      body,
      { timeout: 8 * 60_000 },
    ),
  previewSampleLyrics: (
    id: string,
    body: { kind: 'style' | 'voice'; key: string; voice?: string; recipientName?: string; customStylePrompt?: string; dedication?: string },
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
