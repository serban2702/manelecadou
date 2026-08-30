/**
 * Cât poate trăi o sesiune de admin, cumulat, fără o autentificare nouă prin
 * magic link. Reînnoirile („sliding session") o pot întinde până aici, nu mai
 * departe — altfel un token scurs s-ar putea prelungi la nesfârșit, iar ieșirea
 * din ADMIN_EMAILS n-ar mai însemna nimic.
 */
export const ABSOLUTE_SESSION_DAYS = 60;

export interface SessionPayload {
  /** Momentul autentificării reale. Lipsește în tokenurile emise înainte de sliding session. */
  authAt?: number;
  /** Emiterea tokenului curent — fallback pentru tokenurile vechi. */
  iat?: number;
}

/**
 * Ancora sesiunii, în secunde. Tokenurile de dinaintea acestei versiuni n-au
 * `authAt`, deci cad pe `iat`: pentru ele fereastra absolută pornește de la
 * emiterea tokenului curent, nu de la login. Consecința e o sesiune cu cel mult
 * o durată de token în plus — acceptabil, față de a-i deconecta pe toți la deploy.
 */
export function sessionAnchor(payload: SessionPayload): number {
  return payload.authAt ?? payload.iat ?? 0;
}

/** Mai are voie sesiunea să fie prelungită? */
export function isWithinAbsoluteWindow(
  anchorSec: number,
  nowSec: number,
  days = ABSOLUTE_SESSION_DAYS,
): boolean {
  if (!anchorSec || anchorSec <= 0) return false;
  // Un `authAt` din viitor (ceas dat peste cap, token fabricat) nu e o sesiune validă.
  if (anchorSec > nowSec + 60) return false;
  return (nowSec - anchorSec) / 86_400 <= days;
}
