import { http, getAdminToken, getOpsCredential } from '../http/client';

export interface DbBackup {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

export interface DbInfo {
  env: string;
  host: string;
  database: string;
  resetAllowed: boolean;
}

export class DatabaseApi {
  static info(): Promise<DbInfo> {
    return http.get('/admin/database/info');
  }
  static listBackups(): Promise<DbBackup[]> {
    return http.get('/admin/database/backups');
  }
  static createBackup(label?: string): Promise<DbBackup> {
    return http.post('/admin/database/backups', { label });
  }
  static deleteBackup(name: string): Promise<{ ok: true }> {
    return http.delete(`/admin/database/backups/${encodeURIComponent(name)}`);
  }
  static restoreBackup(name: string): Promise<{ ok: true; bytesApplied: number }> {
    return http.post(`/admin/database/backups/${encodeURIComponent(name)}/restore`);
  }
  static reset(): Promise<{ ok: true; seeder: { users: number; generations: number; conversations: number } }> {
    return http.post('/admin/database/reset');
  }

  /** Download direct cu Bearer token, ca la mail attachments. */
  static async download(name: string): Promise<void> {
    const token = getAdminToken();
    const opsCred = getOpsCredential();
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:1501';
    const res = await fetch(
      `${baseUrl}/api/admin/database/backups/${encodeURIComponent(name)}/download`,
      {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(opsCred ? { 'x-ops-credential': opsCred } : {}),
        },
      },
    );
    if (!res.ok) throw new Error(`Descărcare eșuată (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
