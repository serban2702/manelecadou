/**
 * Helper comun pentru raportarea/filtrarea pe interfață (`experienceSlug`).
 *
 * De ce există fișierul: coloana `experienceSlug` a apărut după ce existau deja
 * comenzi, deci rândurile vechi au NULL (și, în cazuri rare, string gol). Toate
 * acele rânduri au fost servite de designul `classic`, singurul de atunci — deci
 * peste tot (rapoarte, filtre, coloane) NULL trebuie citit ca `classic`, nu ca
 * „necunoscut". Regula stă într-un singur loc ca să nu diverjeze între
 * analitică și listele din admin.
 */
import { DEFAULT_EXPERIENCE_SLUG, isKnownExperienceSlug } from '../experiences/catalog';

/**
 * Expresie SQL care întoarce slug-ul interfeței pentru un rând, cu NULL/'' →
 * `classic`. `col` e coloana calificată (ex. `s."experienceSlug"`).
 */
export function experienceKeySql(col: string): string {
  return `COALESCE(NULLIF(${col},''), '${DEFAULT_EXPERIENCE_SLUG}')`;
}

/**
 * Normalizează valoarea de filtru primită din admin: `undefined`/`all`/slug
 * necunoscut → `null` (fără filtru), altfel slug-ul validat din catalog.
 */
export function normalizeExperienceFilter(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v || v === 'all') return null;
  return isKnownExperienceSlug(v) ? v : null;
}
