import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Hash pentru parola de deblocare a conținutului PRIVAT al unei manele
 * (poze custom + colaje + image-videos). Sare = id-ul generation-ului, ca
 * același text de parolă să producă hash-uri diferite pe manele diferite.
 *
 * NB: e gating de conținut (nu credențiale), userul are voie să pună parole
 * slabe. SHA-256 e suficient aici; nu protejăm secrete sensibile.
 */
export function hashUnlock(generationId: string, password: string): string {
  return createHash('sha256').update(`${generationId}:${password}`).digest('hex');
}

/** Comparație constant-time între parola dată și hash-ul stocat. */
export function verifyUnlock(
  generationId: string,
  password: string | null | undefined,
  storedHash: string | null | undefined,
): boolean {
  if (!storedHash || !password) return false;
  const candidate = hashUnlock(generationId, password);
  const a = Buffer.from(candidate);
  const b = Buffer.from(storedHash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
