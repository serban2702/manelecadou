'use client';

import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:1501';
const TOKEN_KEY = 'mc_admin_token';

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
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
   * Stub pentru refresh token. Dacă API-ul implementează POST /auth/refresh,
   * decomentează și gata. Single-flight ca să evităm refresh-uri concurente.
   */
  private async refreshTokenIfNeeded(): Promise<string | null> {
    // if (this.refreshing) return this.refreshing;
    // this.refreshing = (async () => {
    //   try {
    //     const res = await axios.post(`${API_URL}/api/auth/refresh`, {}, {
    //       withCredentials: true,
    //     });
    //     const newToken = res.data?.accessToken as string | undefined;
    //     if (newToken) { setAdminToken(newToken); return newToken; }
    //     return null;
    //   } catch { return null; }
    //   finally { this.refreshing = null; }
    // })();
    // return this.refreshing;
    return null;
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
