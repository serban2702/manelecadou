import Link from 'next/link';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { SiteShell } from '@/components/SiteShell';
import { getSiteConfig, siteUrl } from '@/lib/site-config';

const API_INTERNAL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:1501';

interface SeoPageSummary {
  slug: string;
  category: string;
  title: string;
  h1: string;
  excerpt: string | null;
  updatedAt: string;
}

interface SeoListPayload {
  categories: string[];
  items: SeoPageSummary[];
}

const CATEGORY_LABELS: Record<string, string> = {
  ocazii: '🎉 Ocazii',
  destinatari: '👤 Pentru cine',
  stiluri: '🎤 Stiluri muzicale',
  cadou: '🎁 Idei de cadou',
  'cum-functioneaza': '⚙️ Cum funcționează',
  'long-tail': '📚 Ghiduri',
};

async function fetchPages(): Promise<SeoListPayload | null> {
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') || h.get('host') || '';
    const res = await fetch(`${API_INTERNAL}/api/public/seo-pages`, {
      headers: { Host: host, 'X-Forwarded-Host': host },
      next: { revalidate: 600, tags: ['seo-pages-list'] },
    });
    if (!res.ok) return null;
    return (await res.json()) as SeoListPayload;
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteConfig();
  const baseUrl = siteUrl(site);
  return {
    title: `Articole & Ghiduri — ${site.name}`,
    description: `Idei de cadou, ghiduri și exemple de manele personalizate. Tot ce trebuie să știi înainte să-ți faci propria manea cadou.`,
    alternates: { canonical: `${baseUrl}/articole` },
  };
}

export default async function ArticoleHubPage() {
  const data = await fetchPages();
  const site = await getSiteConfig();
  const items = data?.items ?? [];

  // grupare pe categorie
  const grouped = items.reduce<Record<string, SeoPageSummary[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  return (
    <SiteShell>
      <main style={{ maxWidth: 1100, margin: '40px auto', padding: '0 20px' }}>
        <h1 className="gold-text serif" style={{ fontSize: 34, textAlign: 'center' }}>
          Articole & ghiduri
        </h1>
        <p className="ld" style={{ textAlign: 'center', marginTop: 4, marginBottom: 32 }}>
          Tot ce trebuie să știi ca să faci cea mai tare manea cadou.
        </p>

        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, opacity: 0.6 }}>
            Articolele se construiesc — revino în curând.
          </div>
        ) : (
          Object.entries(grouped).map(([cat, pages]) => (
            <section key={cat} style={{ marginBottom: 40 }}>
              <h2 style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold-2)', marginBottom: 14 }}>
                {CATEGORY_LABELS[cat] ?? cat}
              </h2>
              <div
                style={{
                  display: 'grid',
                  gap: 14,
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                }}
              >
                {pages.map((p) => (
                  <Link
                    key={p.slug}
                    href={`/articole/${p.slug}`}
                    style={{
                      display: 'block',
                      padding: 16,
                      borderRadius: 10,
                      border: '1px solid var(--line)',
                      background: 'rgba(241,200,77,0.04)',
                      textDecoration: 'none',
                      color: 'inherit',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    <div
                      className="gold-text"
                      style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}
                    >
                      {p.title}
                    </div>
                    {p.excerpt && (
                      <p style={{ fontSize: 12, color: 'rgba(255,245,220,0.6)', lineHeight: 1.5 }}>
                        {p.excerpt}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          ))
        )}

        <div style={{ textAlign: 'center', marginTop: 40, padding: 24, borderTop: '1px solid var(--line)' }}>
          <Link href="/studio" className="btn btn-gold btn-lg" style={{ textDecoration: 'none' }}>
            🎤 Fă propria manea — {(site.basePriceCents / 100).toFixed(2)} {site.currency}
          </Link>
        </div>
      </main>
    </SiteShell>
  );
}
