import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ExperienceSongView } from '@/components/ExperiencePage';
import { getSiteConfig, siteUrl } from '@/lib/site-config';
import { apiInternalUrl } from '@/lib/api-internal';

// Fetch SSR (generateMetadata) → URL INTERN Docker. `NEXT_PUBLIC_API_URL` e gol
// ("") în prod, ceea ce ar produce un fetch RELATIV pe server (`/api/...`) care
// aruncă „Failed to parse URL" → metadata cădea mereu pe fallback-ul generic
// (titlu „cadou" + OG image default), deci preview-ul de share era rupt.
// Convenția SSR: vezi lib/site-config.ts + §9.3 CLAUDE.md.
const API_INTERNAL = apiInternalUrl();

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
  const [gen, site, t] = await Promise.all([fetchGen(id), getSiteConfig(), getTranslations('metadata')]);
  // Titlul și descrierea ajung în og:/twitter: — adică în preview-ul de share.
  // Erau scrise în română pe toate site-urile, deci un link de pe chalgapodarok.bg
  // partajat pe Facebook se anunța „Ascultă maneaua personalizată pentru …".
  const recipient = gen?.recipientName ?? t('songFallbackRecipient');
  const title = t('songTitle', { name: recipient, site: site.name });
  const description = gen
    ? t('songDescription', {
        name: recipient,
        style: gen.style ?? '-',
        voice: gen.voiceArtist ?? '-',
      })
    : site.seo?.description ?? t('description');
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
  return <ExperienceSongView />;
}
