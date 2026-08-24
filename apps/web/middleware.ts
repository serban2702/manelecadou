import { NextRequest, NextResponse } from 'next/server';
import { isIpWhitelisted } from '@/lib/site-shared';
import { resolveCanonicalPath } from '@/lib/page-slugs';
import { resolveExperienceSlug } from '@/experiences/assign';
import type { SiteExperienceConfigLite } from '@/experiences/types';
import { apiInternalUrl } from '@/lib/api-internal';

const API_INTERNAL = apiInternalUrl();

// Cache simplu in-memory pentru a evita un round-trip API la fiecare request.
// TTL 15s e suficient — admin update propagă <30s. Cheia include hidden +
// whitelist ca să nu cache-uim greșit cross-IP.
type CacheEntry = {
  hidden: boolean;
  ipWhitelist: string[];
  locale: string;
  experienceConfig: SiteExperienceConfigLite | null;
  expiresAt: number;
};
const cache = new Map<string, CacheEntry>();
const TTL_MS = 15_000;

function extractClientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  // NextRequest.ip (Vercel-only) — fallback final.
  return (req as unknown as { ip?: string }).ip ?? null;
}

/**
 * Ce întoarcem când `/api/public/site` nu răspunde.
 *
 * Regula: preferăm intrarea EXPIRATĂ din cache, dacă există. O hopă de API nu
 * schimbă limba unui site. Fără asta, un 502 de o secundă (tipic în fereastra
 * unui deploy) fixa `locale: 'ro'` în cache pentru 15 secunde, iar vizitatorii
 * greci și bulgari primeau rescrieri de slug în română.
 *
 * `hidden: false` e intenționat: dacă nu știm, lăsăm site-ul vizibil.
 */
function fallbackFlags(host: string, stale?: CacheEntry): CacheEntry {
  const entry: CacheEntry = stale
    ? { ...stale, expiresAt: Date.now() + FAILURE_TTL_MS }
    : {
        hidden: false,
        ipWhitelist: [],
        locale: 'ro',
        experienceConfig: null,
        expiresAt: Date.now() + FAILURE_TTL_MS,
      };
  // Îl punem în cache, altfel am lovi API-ul căzut la fiecare request. Dar cu
  // TTL scurt, ca să ne întoarcem la datele adevărate imediat ce își revine.
  cache.set(host, entry);
  return entry;
}

/** Cât ținem un răspuns de rezervă: scurt, ca să reîncercăm repede după hopă. */
const FAILURE_TTL_MS = 2_000;

async function fetchSiteFlags(host: string, clientIp: string | null): Promise<CacheEntry> {
  const cached = cache.get(host);
  if (cached && cached.expiresAt > Date.now()) return cached;

  try {
    const headers: Record<string, string> = { Host: host, 'X-Forwarded-Host': host };
    if (clientIp) headers['X-Forwarded-For'] = clientIp;
    const res = await fetch(`${API_INTERNAL}/api/public/site`, {
      headers,
      cache: 'no-store',
    });
    if (!res.ok) return fallbackFlags(host, cached);
    const site = await res.json();
    const entry: CacheEntry = {
      hidden: Boolean(site?.hiddenMode),
      ipWhitelist: Array.isArray(site?.ipWhitelist) ? site.ipWhitelist : [],
      locale: typeof site?.locale === 'string' && site.locale ? site.locale : 'ro',
      experienceConfig: site?.experienceConfig ?? null,
      expiresAt: Date.now() + TTL_MS,
    };
    cache.set(host, entry);
    return entry;
  } catch {
    return fallbackFlags(host, cached);
  }
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const clientIp = extractClientIp(req);
  const flags = await fetchSiteFlags(host, clientIp);

  if (flags.hidden && !isIpWhitelisted(clientIp, flags.ipWhitelist)) {
    // Empty response — browser-ul afișează "ERR_EMPTY_RESPONSE" / "site can't be reached".
    // Cea mai aproape simulare a unui domeniu fără server activ.
    return new NextResponse(null, { status: 444 });
  }

  // Rewrite slug localizat (ex. /slushai pe site BG) → ruta canonică Next (/asculta).
  // Acoperă toate paginile principale + paginile legale. Acceptăm și slug-ul
  // canonic RO pe orice site (link-uri vechi nu se sparg).
  const assigned = resolveExperienceSlug({
    uiParam: req.nextUrl.searchParams.get('ui'),
    cookieSlug: req.cookies.get('mc_ui')?.value ?? null,
    utm: {
      source: req.nextUrl.searchParams.get('utm_source'),
      campaign: req.nextUrl.searchParams.get('utm_campaign'),
      content: req.nextUrl.searchParams.get('utm_content'),
    },
    config: flags.experienceConfig,
  });

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-mc-experience', assigned.slug);

  const canonical = resolveCanonicalPath(req.nextUrl.pathname, flags.locale);
  let res: NextResponse;
  if (canonical && canonical !== req.nextUrl.pathname) {
    const url = req.nextUrl.clone();
    url.pathname = canonical;
    res = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  } else {
    res = NextResponse.next({ request: { headers: requestHeaders } });
  }
  // Cookie doar pentru alegere explicită (?ui= / UTM). Default-ul din admin
  // trebuie să se aplice imediat la vizitatorii noi — un cookie plantat pe
  // default îngheață UI-ul vechi după ce schimbi implicita.
  if (assigned.reason !== 'default') {
    res.cookies.set('mc_ui', assigned.slug, {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}

export const config = {
  // Aplicăm pe TOATE rutele user-facing, dar excludem assets statice ca să nu rupem
  // performanța (image optimizer, fonturi etc.). API-ul e same-origin prin Caddy
  // ca path /api/*, nu prin Next.js — așa că nu trebuie să-l excludem aici.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)',
  ],
  runtime: 'nodejs',
};
