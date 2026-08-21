/** Photo art for cadou style cards. Fallback to clasic if a site adds a new id. */
export const CADOU_STYLE_ART: Record<string, string> = {
  clasic: '/cadou/styles/clasic.jpg',
  modern: '/cadou/styles/modern.jpg',
  oriental: '/cadou/styles/oriental.jpg',
  trompeta: '/cadou/styles/trompeta.jpg',
  romantica: '/cadou/styles/romantica.jpg',
  comerciala: '/cadou/styles/comerciala.jpg',
  opulenta: '/cadou/styles/opulenta.jpg',
  iubire: '/cadou/styles/iubire.jpg',
  tallava: '/cadou/styles/tallava.jpg',
  kuchek: '/cadou/styles/kuchek.jpg',
  trapanele: '/cadou/styles/trapanele.jpg',
  pahar: '/cadou/styles/pahar.jpg',
};

export function cadouStyleArt(id: string, artUrl?: string | null): string {
  if (artUrl) return artUrl;
  return CADOU_STYLE_ART[id] ?? CADOU_STYLE_ART.clasic;
}

const TITLE_TO_STYLE: Array<[string, string]> = [
  ['iubire', 'iubire'],
  ['jale', 'romantica'],
  ['pahar', 'clasic'],
  ['clasic', 'clasic'],
  ['modern', 'modern'],
  ['tromp', 'trompeta'],
  ['oriental', 'oriental'],
  ['opulen', 'opulenta'],
  ['tallava', 'tallava'],
  ['kuchek', 'kuchek'],
  ['trapan', 'trapanele'],
  ['comerc', 'comerciala'],
];

export function cadouStyleIdFromTitle(title: string, category?: string | null): string {
  const t = `${title} ${category ?? ''}`.toLowerCase();
  return TITLE_TO_STYLE.find(([k]) => t.includes(k))?.[1] ?? 'iubire';
}

export function cadouArtForDemo(opts: {
  title: string;
  category?: string | null;
  thumbnailUrl?: string | null;
}): string {
  if (opts.thumbnailUrl) return opts.thumbnailUrl;
  return cadouStyleArt(cadouStyleIdFromTitle(opts.title, opts.category));
}
