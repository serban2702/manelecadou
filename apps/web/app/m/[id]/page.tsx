import type { Metadata } from 'next';
import View from './view';
import { SiteShell } from '@/components/SiteShell';
import { getSiteConfig, siteUrl } from '@/lib/site-config';

// Fetch SSR (generateMetadata) → URL INTERN Docker. `NEXT_PUBLIC_API_URL` e gol
// ("") în prod, ceea ce ar produce un fetch RELATIV pe server (`/api/...`) care
// aruncă „Failed to parse URL" → metadata cădea mereu pe fallback-ul generic
// (titlu „cadou" + OG image default), deci preview-ul de share era rupt.
// Convenția SSR: vezi lib/site-config.ts + §9.3 CLAUDE.md.
const API_INTERNAL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://api:3000';

interface PageGen {
  id: string;
  recipientName?: string;
  voiceArtist?: string;
  style?: string;
  occasion?: string;
  audioUrl?: string | null;
  coverUrl?: string | null;
  socialImageSelected?: string | null;
  socialImageUploaded?: string | null;
}

async function fetchGen(id: string): Promise<PageGen | null> {
  try {
    // Fetch DIRECT după id pe endpointul public `/api/generations/:id`. Înainte
    // foloseam `recent?limit=50` + `.find()`, care rata orice generare ieșită din
    // top 50 (linkul de share e adesea deschis zile mai târziu). Endpointul public
    // întoarce recipientName + coverUrl/socialImage* fără auth și fără filtrare pe
    // siteId — exact ce-i trebuie OG-ului.
    const res = await fetch(`${API_INTERNAL}/api/generations/${id}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as PageGen;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [gen, site] = await Promise.all([fetchGen(id), getSiteConfig()]);
  const recipient = gen?.recipientName ?? 'cadou';
  const title = `Manea pentru ${recipient} — ${site.name}`;
  const description = gen
    ? `Ascultă maneaua personalizată pentru ${recipient}. Stil ${gen.style ?? '-'}, voce ${gen.voiceArtist ?? '-'}.`
    : site.seo?.description ?? 'Generator de manele AI personalizate. Fă o manea în 90 de secunde.';
  const appUrl = siteUrl(site);
  // OG image: poza de share aleasă (sau încărcată) → cover → OG site → icon.
  // URL-urile media vin relative din API (`/uploads/...`); pentru OG e nevoie
  // de URL absolut, așa că prefixăm cu domeniul site-ului.
  const toAbsolute = (u: string | null | undefined): string | null => {
    if (!u) return null;
    if (/^https?:\/\//.test(u)) return u;
    return `${appUrl}${u.startsWith('/') ? '' : '/'}${u}`;
  };
  const ogImage =
    toAbsolute(gen?.socialImageUploaded) ??
    toAbsolute(gen?.socialImageSelected) ??
    toAbsolute(gen?.coverUrl) ??
    site.brand?.ogImageUrl ??
    `${appUrl}/icon-512.png`;
  const url = `${appUrl}/m/${id}`;
  const ogLocale = site.locale ? `${site.locale}_${site.locale.toUpperCase()}` : 'ro_RO';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: site.name,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      locale: ogLocale,
      type: 'music.song',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
    alternates: { canonical: url },
  };
}

export default async function ShareGenerationPage() {
  return (
    <SiteShell hideStickyCta>
      <View />
    </SiteShell>
  );
}
