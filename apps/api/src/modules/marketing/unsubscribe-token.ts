import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token de dezabonare semnat (one-click, fără login).
 *
 * Format: `<payload>.<sig>` unde:
 *   payload = base64url(`${siteId}|${emailLowercased}`)
 *   sig     = base64url(HMAC-SHA256(payload, JWT_SECRET))
 *
 * Nu necesită lookup în DB la verificare — semnătura garantează integritatea, deci
 * nu se pot enumera/forța emailuri. Tokenul nu expiră (link permanent în footer).
 */

function secret(): string {
  return process.env.JWT_SECRET || process.env.MAIL_CRED_KEY || 'change_me_in_production';
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(payload: string): string {
  return b64url(createHmac('sha256', secret()).update(payload).digest());
}

export function makeUnsubscribeToken(siteId: string | null, email: string): string {
  const payload = b64url(`${siteId ?? ''}|${email.trim().toLowerCase()}`);
  return `${payload}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(token: string): { siteId: string | null; email: string } | null {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  // timingSafeEqual cere lungimi egale.
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const decoded = b64urlDecode(payload).toString('utf8');
  const sep = decoded.indexOf('|');
  if (sep < 0) return null;
  const siteId = decoded.slice(0, sep) || null;
  const email = decoded.slice(sep + 1);
  if (!email) return null;
  return { siteId, email };
}
