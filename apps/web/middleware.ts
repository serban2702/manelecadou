import { NextRequest, NextResponse } from 'next/server';
import { isIpWhitelisted } from '@/lib/site-shared';
import { resolveCanonicalPath } from '@/lib/page-slugs';

const API_INTERNAL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://api:3000';

// Cache simplu in-memory pentru a evita un round-trip API la fiecare request.
// TTL 15s e suficient — admin update propagă <30s. Cheia include hidden +
// whitelist ca să nu cache-uim greșit cross-IP.
type CacheEntry = { hidden: boolean; ipWhitelist: string[]; locale: string; expiresAt: number };
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
    if (!res.ok) {
      const entry = { hidden: false, ipWhitelist: [], locale: 'ro', expiresAt: Date.now() + TTL_MS };
      cache.set(host, entry);
      return entry;
    }
    const site = await res.json();
    const entry: CacheEntry = {
      hidden: Boolean(site?.hiddenMode),
      ipWhitelist: Array.isArray(site?.ipWhitelist) ? site.ipWhitelist : [],
      locale: typeof site?.locale === 'string' && site.locale ? site.locale : 'ro',
      expiresAt: Date.now() + TTL_MS,
    };
    cache.set(host, entry);
    return entry;
  } catch {
    return { hidden: false, ipWhitelist: [], locale: 'ro', expiresAt: Date.now() + TTL_MS };
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
  const canonical = resolveCanonicalPath(req.nextUrl.pathname, flags.locale);
  if (canonical && canonical !== req.nextUrl.pathname) {
    const url = req.nextUrl.clone();
    url.pathname = canonical;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
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
