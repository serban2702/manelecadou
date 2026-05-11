import { NextRequest, NextResponse } from 'next/server';

const API_INTERNAL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://api:3000';

// Cache simplu in-memory pentru a evita un round-trip API la fiecare request.
// TTL 15s e suficient — admin update propagă <30s.
type CacheEntry = { hidden: boolean; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 15_000;

async function checkHidden(host: string): Promise<boolean> {
  const cached = cache.get(host);
  if (cached && cached.expiresAt > Date.now()) return cached.hidden;

  try {
    const res = await fetch(`${API_INTERNAL}/api/public/site`, {
      headers: { Host: host, 'X-Forwarded-Host': host },
      // Important: nu cache-uim la edge — folosim cache-ul nostru local
      cache: 'no-store',
    });
    if (!res.ok) {
      cache.set(host, { hidden: false, expiresAt: Date.now() + TTL_MS });
      return false;
    }
    const site = await res.json();
    const hidden = Boolean(site?.hiddenMode);
    cache.set(host, { hidden, expiresAt: Date.now() + TTL_MS });
    return hidden;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const hidden = await checkHidden(host);

  if (hidden) {
    // Empty response — browser-ul afișează "ERR_EMPTY_RESPONSE" / "site can't be reached".
    // Cea mai aproape simulare a unui domeniu fără server activ.
    return new NextResponse(null, { status: 444 });
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
