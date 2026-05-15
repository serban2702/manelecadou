import { http } from '../http/client';
import type { LyricsLog, LyricsLogDetail, LyricsSummary } from '../types';

export class LyricsApi {
  static summary(): Promise<LyricsSummary> {
    return http.get('/admin/lyrics/summary');
  }
  static logs(
    params: {
      limit?: number;
      outcome?: string;
      stage?: string;
      generationId?: string;
      siteId?: string;
    } = {},
  ): Promise<LyricsLog[]> {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    return http.get(`/admin/lyrics/logs${qs.toString() ? '?' + qs.toString() : ''}`);
  }
  static logDetail(id: string): Promise<LyricsLogDetail> {
    return http.get(`/admin/lyrics/logs/${id}`);
  }
}
