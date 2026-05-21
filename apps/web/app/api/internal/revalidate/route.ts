import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

/**
 * Endpoint intern apelat de NestJS API după ce o pagină SEO e regenerată
 * (sau alte resurse cu cache Next). Invalidează tag-ul Next.js corespunzător
 * ca să nu așteptăm 60s pentru cache TTL.
 *
 * Securitate: secret partajat via env `REVALIDATE_SECRET`. NU expuneți în
 * client. NU e accesibil din afara network-ului Docker (folosit prin
 * `WEB_INTERNAL_URL=http://web:1500/api/internal/revalidate`).
 *
 * Body JSON: { tag: string, secret: string }
 */
export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'revalidate disabled (no secret)' }, { status: 503 });
  }
  let body: { tag?: string; secret?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body.secret || body.secret !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!body.tag || typeof body.tag !== 'string') {
    return NextResponse.json({ error: 'tag required' }, { status: 400 });
  }
  try {
    revalidateTag(body.tag);
    return NextResponse.json({ ok: true, tag: body.tag });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
