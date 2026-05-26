import type { Metadata } from 'next';
import View from './view';
import { SiteShell } from '@/components/SiteShell';
import { getSiteConfig, siteUrl } from '@/lib/site-config';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:1501';

interface PageGen {
  id: string;
  recipientName?: string;
  voiceArtist?: string;
  style?: string;
  occasion?: string;
  audioUrl?: string | null;
  coverUrl?: string | null;
}

async function fetchGen(id: string): Promise<PageGen | null> {
  try {
    const res = await fetch(`${API_URL}/api/generations/recent?limit=50`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const items: PageGen[] = await res.json();
    return items.find((g) => g.id === id) ?? null;
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
  const ogImage = gen?.coverUrl ?? site.brand?.ogImageUrl ?? `${appUrl}/icon-512.png`;
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
