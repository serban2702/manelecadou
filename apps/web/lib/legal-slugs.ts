/**
 * @deprecated folosește direct `@/lib/page-slugs`. Acest fișier rămâne pentru
 * compatibilitate cu importurile existente.
 */
export {
  type LegalPage,
  LEGAL_CANONICAL,
  getLegalSlug,
  getLegalPath,
  resolveLegalCanonical,
} from './page-slugs';

import { PAGE_SLUGS } from './page-slugs';
import type { Locale } from '@/i18n/locales';
import type { LegalPage } from './page-slugs';

export const LEGAL_SLUGS: Record<Locale, Record<LegalPage, string>> = Object.fromEntries(
  (Object.keys(PAGE_SLUGS) as Locale[]).map((loc) => [
    loc,
    {
      terms: PAGE_SLUGS[loc].terms,
      privacy: PAGE_SLUGS[loc].privacy,
      cookies: PAGE_SLUGS[loc].cookies,
    },
  ]),
) as Record<Locale, Record<LegalPage, string>>;
