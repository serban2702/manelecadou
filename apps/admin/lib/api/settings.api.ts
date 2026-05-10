import { http } from '../http/client';
import type { SettingCategoryView } from '../types';

export class SettingsApi {
  static list(): Promise<SettingCategoryView[]> {
    return http.get('/admin/settings');
  }
  static update(updates: Array<{ key: string; value: string; clear?: boolean }>): Promise<{ ok: true; count: number }> {
    return http.patch('/admin/settings', { updates });
  }
}
