import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.MAIL_CRED_KEY;
  if (!raw || raw.length < 16) {
    throw new Error('MAIL_CRED_KEY env missing or too short (>=16 chars required)');
  }
  cachedKey = scryptSync(raw, 'mail-cred-v1', 32);
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  if (plain == null) return '';
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(payload: string | null | undefined): string {
  if (!payload) return '';
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Invalid encrypted payload format');
  }
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const enc = Buffer.from(parts[3], 'base64');
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error('Invalid IV/tag length');
  }
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

/** Mask helper pentru log-uri și payload-uri admin: nu returnează niciodată plain. */
export function maskSecret(payload: string | null | undefined): string {
  return payload ? '••••••••' : '';
}
