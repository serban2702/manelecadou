import { http } from '../http/client';

export type SiteDemoCategory =
  | 'aniversare'
  | 'nunta'
  | 'botez'
  | 'cumetrie'
  | 'dragoste'
  | 'prietenie'
  | 'comemorare'
  | 'altele';

export const SITE_DEMO_CATEGORIES: SiteDemoCategory[] = [
  'aniversare',
  'nunta',
  'botez',
  'cumetrie',
  'dragoste',
  'prietenie',
  'comemorare',
  'altele',
];

export const SITE_DEMO_CATEGORY_LABELS: Record<SiteDemoCategory, string> = {
  aniversare: 'Aniversare',
  nunta: 'Nuntă',
  botez: 'Botez',
  cumetrie: 'Cumetrie',
  dragoste: 'Dragoste',
  prietenie: 'Prietenie',
  comemorare: 'Comemorare',
  altele: 'Altele',
};

export interface SiteDemo {
  id: string;
  siteId: string;
  title: string;
  fromName: string | null;
  toName: string | null;
  category: SiteDemoCategory;
  lyrics: string | null;
  audioUrl: string;
  audioDurationSec: number | null;
  previewStartSec: number;
  thumbnailUrl: string | null;
  sortOrder: number;
  active: boolean;
  featuredOnHome: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SiteDemoFormFields {
  title: string;
  fromName?: string | null;
  toName?: string | null;
  category?: SiteDemoCategory;
  lyrics?: string | null;
  previewStartSec?: number;
  audioDurationSec?: number | null;
  sortOrder?: number;
  active?: boolean;
  featuredOnHome?: boolean;
  siteId?: string;
}

function toFormData(
  fields: Partial<SiteDemoFormFields>,
  files: { audio?: File | null; thumbnail?: File | null },
): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    fd.append(k, typeof v === 'boolean' ? String(v) : String(v));
  }
  if (files.audio) fd.append('audio', files.audio);
  if (files.thumbnail) fd.append('thumbnail', files.thumbnail);
  return fd;
}

export class SiteDemosApi {
  static list(siteId?: string): Promise<{ items: SiteDemo[] }> {
    const qs = siteId ? `?siteId=${encodeURIComponent(siteId)}` : '';
    return http.get(`/admin/site-demos${qs}`);
  }

  static getOne(id: string): Promise<SiteDemo> {
    return http.get(`/admin/site-demos/${id}`);
  }

  static create(
    fields: SiteDemoFormFields,
    files: { audio: File; thumbnail?: File | null },
  ): Promise<SiteDemo> {
    const fd = toFormData(fields, files);
    return http.post('/admin/site-demos', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }

  static update(
    id: string,
    fields: Partial<SiteDemoFormFields>,
    files: { audio?: File | null; thumbnail?: File | null } = {},
  ): Promise<SiteDemo> {
    const fd = toFormData(fields, files);
    return http.patch(`/admin/site-demos/${id}`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }

  static delete(id: string): Promise<{ ok: boolean }> {
    return http.delete(`/admin/site-demos/${id}`);
  }
}
