import { http } from '@/lib/http/client';

export interface SiteDto {
  id: string;
  slug: string;
  domain: string;
  name: string;
  locale: string;
  currency: string;
  basePriceCents: number;
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
  stripe: { priceId?: string | null; productName?: string; statementDescriptor?: string };
  suno: {
    basePrompt?: string;
    stylePromptMap?: Record<string, string>;
    voiceMap?: Record<string, string>;
    lyricsLocale?: string;
  };
  fromEmail: string | null;
  supportEmail: string | null;
  adminEmails: string[];
  active: boolean;
  isDefault: boolean;
  sslEnabled: boolean;
  maintenanceMode: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
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
    body: { kind: 'style' | 'voice'; key: string; voice?: string; recipientName?: string; customStylePrompt?: string },
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
