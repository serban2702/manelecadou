'use client';

import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:1501';
const TOKEN_KEY = 'mc_admin_token';
/** Credențialul ops (user:parolă, ca la terminalul Claude Ops) pentru zona /admin/database.
 *  Ținut în sessionStorage — se cere din nou la fiecare sesiune de browser. */
const OPS_CRED_KEY = 'mc_ops_credential';
/** De ce a fost trimis omul la /login, plus când expira tokenul. Vezi `logoutDiagnosis`. */
const LOGOUT_REASON_KEY = 'mc_admin_logout_reason';
const TOKEN_EXP_KEY = 'mc_admin_token_exp';

export function getOpsCredential(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(OPS_CRED_KEY);
}

export function setOpsCredential(cred: string | null): void {
  if (typeof window === 'undefined') return;
  if (cred) window.sessionStorage.setItem(OPS_CRED_KEY, cred);
  else window.sessionStorage.removeItem(OPS_CRED_KEY);
}

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
    // O autentificare reușită anulează orice motiv de deconectare rămas — altfel
    // intrarea directă pe /login/verify (linkul din email) ar lăsa un motiv vechi
    // care s-ar afișa peste săptămâni, la următoarea vizită pe /login.
    window.localStorage.removeItem(LOGOUT_REASON_KEY);
    const left = tokenSecondsLeft(token);
    if (left !== null) {
      window.localStorage.setItem(TOKEN_EXP_KEY, String(Math.floor(Date.now() / 1000) + left));
    }
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

/**
 * De ce ești pe /login.
 *
 * Distincția contează: „sesiunea a expirat" e problema noastră (durata
 * tokenului), pe când „tokenul a dispărut înainte de expirare" e browserul care
 * a curățat datele site-ului — două cauze cu leacuri complet diferite, imposibil
 * de deosebit altfel, fiindcă ambele arată identic: ecranul de login.
 */
export function logoutDiagnosis(): { reason: 'expired' | 'storage-cleared' | 'signed-out'; at: number } | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(LOGOUT_REASON_KEY);
  const expRaw = window.localStorage.getItem(TOKEN_EXP_KEY);
  const exp = expRaw ? Number(expRaw) : 0;
  const now = Math.floor(Date.now() / 1000);
  if (raw === 'manual') return { reason: 'signed-out', at: now };
  if (raw === 'unauthorized') return { reason: 'expired', at: exp };
  // Nici token, nici motiv, dar aveam o expirare în viitor: storage-ul a fost golit.
  if (!window.localStorage.getItem(TOKEN_KEY) && exp > now) return { reason: 'storage-cleared', at: exp };
  return null;
}

export function noteLogoutReason(reason: 'unauthorized' | 'manual'): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOGOUT_REASON_KEY, reason);
}

export function clearLogoutDiagnosis(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LOGOUT_REASON_KEY);
  window.localStorage.removeItem(TOKEN_EXP_KEY);
}

/** Secundele rămase din token, citite din `exp`. `null` = token lipsă sau ilizibil. */
export function tokenSecondsLeft(token = getAdminToken()): number | null {
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    if (!json.exp) return null;
    return json.exp - Math.floor(Date.now() / 1000);
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message?: string) {
    super(message || (typeof body === 'string' ? body : (body as { message?: string })?.message ?? `HTTP ${status}`));
    this.name = 'ApiError';
  }
}

/**
 * Singleton axios instance pentru admin.
 * - Base URL = NEXT_PUBLIC_API_URL + /api
 * - Auto Bearer token din localStorage
 * - Pe 401 → curăță tokenul + redirect la /login
 * - Pe 5xx / network → ApiError cu mesaj prietenos
 *
 * Refresh token logic e pregătit (vezi refreshTokenIfNeeded), dar API-ul curent
 * folosește JWT cu TTL 7d, deci nu există încă endpoint /auth/refresh. Hook-urile
 * sunt acolo să fie ușor de extins fără să modifici nimic la consumeri.
 */
class HttpClient {
  private instance: AxiosInstance;
  private refreshing: Promise<string | null> | null = null;

  constructor() {
    this.instance = axios.create({
      baseURL: `${API_URL}/api`,
      timeout: 30_000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.instance.interceptors.request.use((config) => {
      const token = getAdminToken();
      if (token) config.headers.Authorization = `Bearer ${token}`;
      // Atașează site-ul activ din selector — backend-ul îl folosește pentru
      // a filtra răspunsul. "all" = cross-site (pentru pagini agregat).
      // Excepție: /auth/* trebuie să funcționeze fără context de site (login-ul
      // admin nu depinde de selector — se rezolvă din Host pe backend).
      if (typeof window !== 'undefined') {
        const url = config.url ?? '';
        const isAuthCall = /^\/?auth\//.test(url);
        if (!isAuthCall) {
          const siteId = window.localStorage.getItem('mc_admin_site');
          if (siteId) config.headers['x-site-id'] = siteId;
        }
        // Zona /admin/database e gate-uită suplimentar cu credențialul ops
        // (OpsCredentialGuard pe backend). Backend-ul răspunde 403
        // OPS_CREDENTIAL_REQUIRED când lipsește/e greșit.
        if (/^\/?admin\/database\b/.test(url)) {
          const cred = getOpsCredential();
          if (cred) config.headers['x-ops-credential'] = cred;
        }
      }
      return config;
    });

    this.instance.interceptors.response.use(
      (res) => res,
      async (error: AxiosError) => {
        const status = error.response?.status;
        const url = error.config?.url ?? '';
        const isAuthCall = /\/auth\//.test(url);

        if (status === 401 && !isAuthCall && typeof window !== 'undefined') {
          // Hook pentru refresh — dacă vreodată adăugăm endpoint /auth/refresh, aici se face.
          const newToken = await this.refreshTokenIfNeeded();
          if (newToken && error.config) {
            error.config.headers!.Authorization = `Bearer ${newToken}`;
            return this.instance.request(error.config);
          }
          noteLogoutReason('unauthorized');
          setAdminToken(null);
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }

        const apiErr = new ApiError(status ?? 0, error.response?.data ?? error.message, error.message);
        return Promise.reject(apiErr);
      },
    );
  }

  /**
   * Reînnoiește tokenul. Single-flight: mai multe cereri care primesc 401 în
   * același moment produc UN singur apel de refresh.
   *
   * Limita reală: un token DEJA expirat nu se mai poate reînnoi — `/auth/refresh`
   * cere unul valid. De-aia reînnoirea care contează e cea proactivă
   * (`ensureFreshToken`), nu asta de pe calea de eroare.
   */
  private async refreshTokenIfNeeded(): Promise<string | null> {
    if (this.refreshing) return this.refreshing;
    const current = getAdminToken();
    if (!current) return null;
    this.refreshing = (async () => {
      try {
        const res = await axios.post<{ accessToken?: string }>(
          `${API_URL}/api/auth/refresh`,
          {},
          { headers: { Authorization: `Bearer ${current}` }, timeout: 15_000 },
        );
        const next = res.data?.accessToken;
        if (next) {
          setAdminToken(next);
          return next;
        }
        return null;
      } catch {
        return null;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  /**
   * Prelungește sesiunea dacă tokenului îi mai rămân sub `thresholdDays` zile.
   * Chemată la deschiderea adminului și periodic cât tabul stă deschis, ține
   * sesiunea vie la nesfârșit pentru cine intră măcar o dată la câteva zile —
   * până la limita absolută impusă de server.
   */
  async ensureFreshToken(thresholdDays = 5): Promise<void> {
    const left = tokenSecondsLeft();
    if (left === null || left <= 0) return; // lipsă sau expirat: refresh-ul ar fi respins
    if (left > thresholdDays * 86_400) return;
    await this.refreshTokenIfNeeded();
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const r = await this.instance.get<T>(url, config);
    return r.data;
  }
  async post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const r = await this.instance.post<T>(url, body, config);
    return r.data;
  }
  async patch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const r = await this.instance.patch<T>(url, body, config);
    return r.data;
  }
  async put<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const r = await this.instance.put<T>(url, body, config);
    return r.data;
  }
  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const r = await this.instance.delete<T>(url, config);
    return r.data;
  }

  /** Pentru cazuri speciale (download blob, etc.) */
  raw(): AxiosInstance {
    return this.instance;
  }
}

export const http = new HttpClient();
