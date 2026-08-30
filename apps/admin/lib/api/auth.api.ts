import { http } from '../http/client';

export class AuthApi {
  static requestMagicLink(email: string): Promise<{ ok: true }> {
    return http.post('/auth/magic-link/request', { email });
  }

  static consumeMagicLink(token: string): Promise<{ accessToken: string; userId: string }> {
    return http.get(`/auth/magic-link/consume?token=${encodeURIComponent(token)}`);
  }

  static me(): Promise<{ id: string; email: string; freeDemoUsed: boolean; name: string | null }> {
    return http.get('/auth/me');
  }

  /** Prelungește sesiunea. Cere un token încă valid. */
  static refresh(): Promise<{ accessToken: string; expiresAt: string }> {
    return http.post('/auth/refresh', {});
  }
}
