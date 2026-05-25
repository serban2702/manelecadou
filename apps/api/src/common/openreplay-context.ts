/**
 * OpenReplay session-id propagation.
 *
 * Clientul (apps/web) trimite header-ul `X-OpenReplay-SessionID` la fiecare
 * request fetch. Middleware-ul îl extrage și-l pune într-un AsyncLocalStorage.
 * Un TypeORM subscriber citește din storage la `beforeInsert` și-l copiază
 * automat pe entitățile care au coloana (Payment, Generation, ErrorLog) —
 * fără să modificăm fiecare call-site de `repo.create(...)`.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface OpenReplayContext {
  sessionId: string | null;
}

export const openReplayStorage = new AsyncLocalStorage<OpenReplayContext>();

export function getOpenReplaySessionId(): string | null {
  return openReplayStorage.getStore()?.sessionId ?? null;
}

/** Sanitize + cap la 64 chars. OpenReplay session IDs sunt uint64 (max 20 digits). */
export function extractOpenReplaySessionId(
  headers: Record<string, unknown> | undefined | null,
): string | null {
  if (!headers) return null;
  const raw =
    (headers['x-openreplay-sessionid'] as unknown) ??
    (headers['x-openreplay-session-id'] as unknown);
  if (!raw) return null;
  const str = Array.isArray(raw) ? String(raw[0]) : String(raw);
  const cleaned = str.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return cleaned || null;
}
