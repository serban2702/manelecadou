import { http } from '../http/client';
import type { KbEntryRow } from '../types';

export class KbApi {
  static list(): Promise<KbEntryRow[]> {
    return http.get('/admin/kb/entries');
  }
  static create(input: { title: string; content: string; tags?: string[]; lang?: string; active?: boolean }): Promise<KbEntryRow> {
    return http.post('/admin/kb/entries', input);
  }
  static update(id: string, input: Partial<{ title: string; content: string; tags: string[]; lang: string; active: boolean }>): Promise<KbEntryRow> {
    return http.patch(`/admin/kb/entries/${id}`, input);
  }
  static delete(id: string): Promise<{ ok: true }> {
    return http.delete(`/admin/kb/entries/${id}`);
  }
}
