import type { LucideIcon } from 'lucide-react';
import {
  Eye,
  Fingerprint,
  BadgeDollarSign,
  Palette,
  Music2,
  LayoutTemplate,
  Wand2,
  FlaskConical,
  Settings2,
  Star,
} from 'lucide-react';

export const STUDIO_STORAGE_KEY = 'mc_site_studio';

export type StudioNavId =
  | 'overview'
  | 'identity'
  | 'prices'
  | 'appearance'
  | 'catalog'
  | 'interfaces'
  | 'generation'
  | 'playground'
  | 'operations'
  | 'top';

export interface StudioNavItem {
  id: StudioNavId;
  href: string;
  label: string;
  help: string;
  icon: LucideIcon;
}

export const SITE_NAV: StudioNavItem[] = [
  { id: 'overview', href: '/site', label: 'Privire de ansamblu', help: 'Stare și goluri', icon: Eye },
  { id: 'identity', href: '/site/identity', label: 'Identitate', help: 'Domeniu, nume, limbă', icon: Fingerprint },
  { id: 'interfaces', href: '/site/interfaces', label: 'Interfețe', help: 'Design: pachete, catalog, surse', icon: LayoutTemplate },
  { id: 'appearance', href: '/site/appearance', label: 'Aspect', help: 'Culori, logo, SEO, recenzii', icon: Palette },
  { id: 'prices', href: '/site/prices', label: 'Plată', help: 'Demo, cadou, Stripe', icon: BadgeDollarSign },
  { id: 'catalog', href: '/site/catalog/styles', label: 'Librărie', help: 'Se copiază în interfețe', icon: Music2 },
  { id: 'generation', href: '/site/generation', label: 'Versuri', help: 'Writer / critic default', icon: Wand2 },
  { id: 'playground', href: '/site/playground', label: 'Playground', help: 'Generează Suno / Lyria', icon: FlaskConical },
  { id: 'operations', href: '/site/operations', label: 'Operațiuni', help: 'Live, email, facturi, pixeli', icon: Settings2 },
  { id: 'top', href: '/site/top', label: 'Top săptămână', help: 'Ce apare pe /top', icon: Star },
];

export interface StudioSearchItem {
  id: string;
  label: string;
  href: string;
  keywords: string[];
  group: StudioNavId;
  /** Ancora `data-field` de evidențiat pe destinație. Gol = `id`. Folosit când
   *  mai multe intrări de căutare duc la același câmp (ex. Stripe descriptor). */
  field?: string;
  /** Ancora trăiește pe ecranul unui design (`/site/interfaces/<slug>`), nu în
   *  lista de interfețe. `searchStudio()` completează slug-ul la runtime. */
  interfaceScoped?: boolean;
}

export const STUDIO_SEARCH: StudioSearchItem[] = [
  { id: 'overview', label: 'Privire de ansamblu', href: '/site', keywords: ['overview', 'sănătate', 'status'], group: 'overview' },
  { id: 'identity', label: 'Identitate', href: '/site/identity', keywords: ['cod intern', 'domeniu', 'nume'], group: 'identity' },
  { id: 'identity.slug', label: 'Cod intern', href: '/site/identity', keywords: ['slug', 'cod', 'intern'], group: 'identity' },
  { id: 'identity.domain', label: 'Domeniu', href: '/site/identity', keywords: ['domain', 'host', 'dns'], group: 'identity' },
  { id: 'identity.name', label: 'Nume brand', href: '/site/identity', keywords: ['name', 'brand'], group: 'identity' },
  { id: 'identity.locale', label: 'Limbă', href: '/site/identity', keywords: ['locale', 'limba', 'i18n'], group: 'identity' },
  { id: 'identity.currency', label: 'Valută', href: '/site/identity', keywords: ['currency', 'ron', 'eur'], group: 'identity' },
  { id: 'identity.langSwitcher', label: 'Meniu de limbă', href: '/site/identity', keywords: ['lang', 'switcher', 'topbar', 'limbă'], group: 'identity' },
  { id: 'identity.notes', label: 'Note interne', href: '/site/identity', keywords: ['notes', 'intern'], group: 'identity' },
  // Pachetele se editează pe un design, nu în lista de interfețe → interfaceScoped.
  { id: 'price.basic', label: 'Preț Standard', href: '/site/interfaces', keywords: ['basic', 'pachet', '29', 'standard'], group: 'interfaces', interfaceScoped: true },
  { id: 'price.plus', label: 'Preț Plus', href: '/site/interfaces', keywords: ['plus', 'pachet', '49'], group: 'interfaces', interfaceScoped: true },
  { id: 'price.premium', label: 'Preț Premium', href: '/site/interfaces', keywords: ['premium', 'pachet', '69'], group: 'interfaces', interfaceScoped: true },
  { id: 'price.compare', label: 'Preț tăiat pachet', href: '/site/interfaces', keywords: ['compare', 'strikethrough', 'tăiat'], group: 'interfaces', interfaceScoped: true },
  { id: 'price.demo', label: 'Demo 30s gratuit', href: '/site/prices', keywords: ['demo', 'pay-first', 'plată'], group: 'prices' },
  { id: 'price.legacy', label: 'Preț bază (model vechi)', href: '/site/prices', keywords: ['basePrice', 'strikethrough', 'bază', 'legacy'], group: 'prices' },
  { id: 'price.stripe', label: 'Stripe pe extras', href: '/site/prices', keywords: ['statement', 'productName', 'descriptor'], group: 'prices' },
  { id: 'price.priceId', label: 'Stripe price ID', href: '/site/prices', keywords: ['priceId', 'stripe'], group: 'prices' },
  { id: 'appearance.colors', label: 'Culori', href: '/site/appearance', keywords: ['brand', 'primary', 'accent', 'paletă', 'hex'], group: 'appearance' },
  { id: 'appearance.tagline', label: 'Tagline', href: '/site/appearance', keywords: ['slogan', 'subtitle', 'motto'], group: 'appearance' },
  { id: 'appearance.logo', label: 'Logo', href: '/site/appearance', keywords: ['logo', 'siglă'], group: 'appearance' },
  { id: 'appearance.og', label: 'Imagine de share', href: '/site/appearance', keywords: ['og', 'share', 'facebook', 'whatsapp'], group: 'appearance' },
  { id: 'appearance.favicon', label: 'Favicon', href: '/site/appearance', keywords: ['favicon', 'iconiță', 'tab'], group: 'appearance' },
  { id: 'appearance.banner', label: 'Banner email', href: '/site/appearance', keywords: ['email', 'banner', 'header'], group: 'appearance' },
  { id: 'appearance.seo', label: 'SEO', href: '/site/appearance', keywords: ['title', 'description', 'keywords', 'titlu', 'google'], group: 'appearance' },
  { id: 'appearance.social', label: 'Social', href: '/site/appearance', keywords: ['instagram', 'facebook', 'tiktok', 'youtube', 'whatsapp'], group: 'appearance' },
  { id: 'appearance.phone', label: 'Telefon', href: '/site/appearance', keywords: ['phone', 'whatsapp', 'contact', 'număr'], group: 'appearance' },
  { id: 'appearance.testimonials', label: 'Testimoniale tenant', href: '/site/appearance', keywords: ['recenzii', 'librărie'], group: 'appearance' },
  { id: 'interfaces.testimonials', label: 'Testimoniale (pe design)', href: '/site/interfaces', keywords: ['recenzii', 'quote', 'stele', 'citat', 'i18n', 'testimonial'], group: 'interfaces', interfaceScoped: true },
  { id: 'catalog.styles', label: 'Librărie — stiluri', href: '/site/catalog/styles', keywords: ['style', 'manea', 'prompt', 'stil', 'librărie'], group: 'catalog' },
  { id: 'catalog.occasions', label: 'Ocazii', href: '/site/catalog/occasions', keywords: ['nuntă', 'zi de naștere', 'occasion', 'ocazie'], group: 'catalog' },
  { id: 'catalog.voices', label: 'Voci', href: '/site/catalog/voices', keywords: ['male', 'female', 'voce', 'persona'], group: 'catalog' },
  { id: 'catalog.style.sunoPrompt', label: 'Prompt Suno (stil)', href: '/site/catalog/styles', keywords: ['suno', 'tag', 'stylePromptMap'], group: 'catalog' },
  { id: 'catalog.style.googlePrompt', label: 'Prompt Google Lyria (stil)', href: '/site/catalog/styles', keywords: ['lyria', 'google', 'gemini'], group: 'catalog' },
  { id: 'catalog.style.lyricsHint', label: 'Hint versuri', href: '/site/catalog/styles', keywords: ['lyrics', 'hint', 'versuri'], group: 'catalog' },
  { id: 'catalog.style.personaMale', label: 'Persona masculin', href: '/site/catalog/styles', keywords: ['persona', 'sunoPersona'], group: 'catalog' },
  { id: 'catalog.occasion.sunoPrompt', label: 'Prompt Suno (ocazie)', href: '/site/catalog/occasions', keywords: ['suno', 'ocazie'], group: 'catalog' },
  { id: 'catalog.occasion.googlePrompt', label: 'Prompt Google Lyria (ocazie)', href: '/site/catalog/occasions', keywords: ['lyria', 'google', 'ocazie'], group: 'catalog' },
  { id: 'catalog.voice.sunoVoice', label: 'ID voce Suno', href: '/site/catalog/voices', keywords: ['sunoVoice', 'voiceMap'], group: 'catalog' },
  { id: 'catalog.voice.persona', label: 'Persona voce', href: '/site/catalog/voices', keywords: ['persona', 'generate-persona'], group: 'catalog' },
  { id: 'interfaces', label: 'Interfețe', href: '/site/interfaces', keywords: ['classic', 'cadou', 'utm', 'experience'], group: 'interfaces' },
  { id: 'interfaces.classic', label: 'Interfață Classic', href: '/site/interfaces/classic', keywords: ['classic', 'default'], group: 'interfaces' },
  { id: 'interfaces.cadou', label: 'Interfață Cadou', href: '/site/interfaces/cadou', keywords: ['cadou', 'landing', 'wizard'], group: 'interfaces' },
  { id: 'interfaces.enabled', label: 'Activare interfață', href: '/site/interfaces', keywords: ['enabled', 'activă', 'implicită'], group: 'interfaces', interfaceScoped: true },
  { id: 'interfaces.utm', label: 'Reguli UTM', href: '/site/interfaces', keywords: ['utm', 'source', 'campaign', 'ads', 'ui'], group: 'interfaces', interfaceScoped: true },
  { id: 'interfaces.catalog', label: 'Catalog interfață', href: '/site/interfaces', keywords: ['moștenire', 'override', 'stiluri', 'voci'], group: 'interfaces', interfaceScoped: true },
  { id: 'interfaces.packages', label: 'Pachete (pe design)', href: '/site/interfaces', keywords: ['livrabile', 'duration', 'upsell', 'videoclip', 'preț', 'refaceri', 'colaj', 'pachet'], group: 'interfaces', interfaceScoped: true },
  { id: 'interfaces.engine', label: 'Motor pe design', href: '/site/interfaces', keywords: ['suno', 'google', 'lyria', 'musicEngine'], group: 'interfaces', interfaceScoped: true },
  { id: 'interfaces.writer', label: 'Writer interfață', href: '/site/interfaces', keywords: ['writerSystemPrompt', 'versuri'], group: 'interfaces', interfaceScoped: true },
  { id: 'interfaces.demos', label: 'Demo-uri interfață', href: '/site/interfaces', keywords: ['demoIds', 'ascultă'], group: 'interfaces', interfaceScoped: true },
  { id: 'interfaces.reactions', label: 'Reacții Cadou', href: '/site/interfaces/cadou', keywords: ['tiktok', 'instagram', 'clips', 'reacții'], group: 'interfaces' },
  { id: 'engine', label: 'Motor audio', href: '/site/generation', keywords: ['suno', 'lyria', 'google', 'musicEngine'], group: 'generation' },
  { id: 'generation.basePrompt', label: 'Prompt de bază Suno', href: '/site/generation', keywords: ['basePrompt', 'suno'], group: 'generation' },
  { id: 'generation.review', label: 'Review versuri', href: '/site/generation', keywords: ['lyricsReview', 'versuri', 'wizard'], group: 'generation' },
  { id: 'generation.lyricsLocale', label: 'Limbă versuri', href: '/site/generation', keywords: ['lyricsLocale', 'limba'], group: 'generation' },
  { id: 'generation.writer', label: 'Writer', href: '/site/generation', keywords: ['lyrics', 'openai', 'placeholder', 'writerSystemPrompt'], group: 'generation' },
  { id: 'generation.writerUser', label: 'Cererea către scriitorul de versuri', href: '/site/generation', keywords: ['writerUserTemplate', 'placeholder', 'writer'], group: 'generation' },
  { id: 'generation.critic', label: 'Editor de versuri', href: '/site/generation', keywords: ['critic', 'draft', 'placeholder', 'editor'], group: 'generation' },
  { id: 'generation.criticUser', label: 'Cererea către editorul de versuri', href: '/site/generation', keywords: ['criticUserTemplate', 'draft', 'editor'], group: 'generation' },
  { id: 'playground', label: 'Playground', href: '/site/playground', keywords: ['suno', 'lyria', 'google', 'test', 'prompt', 'generează'], group: 'playground' },
  { id: 'operations.active', label: 'Site activ', href: '/site/operations', keywords: ['active', 'online'], group: 'operations' },
  { id: 'operations.ssl', label: 'SSL', href: '/site/operations', keywords: ['tls', 'certificat', 'https'], group: 'operations' },
  { id: 'operations.maintenance', label: 'Mentenanță', href: '/site/operations', keywords: ['maintenance', 'ascuns', 'hidden'], group: 'operations' },
  { id: 'operations.hidden', label: 'Site ascuns', href: '/site/operations', keywords: ['hidden', 'ascuns', 'offline'], group: 'operations' },
  { id: 'operations.ip', label: 'IP-uri scutite', href: '/site/operations', keywords: ['ip', 'whitelist', 'scutite'], group: 'operations' },
  { id: 'operations.mail', label: 'Mail per-site', href: '/site/operations', keywords: ['powermail', 'smtp', 'from', 'expeditor'], group: 'operations' },
  { id: 'operations.company', label: 'Date firmă', href: '/site/operations', keywords: ['cui', 'iban', 'legal', 'firmă'], group: 'operations' },
  { id: 'operations.smartbill', label: 'SmartBill', href: '/site/operations', keywords: ['factură', 'cif', 'tva'], group: 'operations' },
  // Aceeași casetă ca `price.stripe` — ancora de acolo, nu una proprie.
  { id: 'operations.stripe', label: 'Stripe descriptor', href: '/site/prices', keywords: ['statement', 'productName'], group: 'prices', field: 'price.stripe' },
  { id: 'operations.analytics', label: 'Pixeli și ads', href: '/site/operations', keywords: ['ga4', 'meta', 'pixel', 'capi', 'tiktok', 'analytics'], group: 'operations' },
  { id: 'operations.ai', label: 'AI chat', href: '/site/operations', keywords: ['irina', 'greeting', 'manual', 'suggest', 'auto'], group: 'operations' },
  { id: 'top.source', label: 'Sursă top săptămână', href: '/site/top', keywords: ['demo', 'live', 'manual', 'seed', 'template'], group: 'top' },
];

/** Ancora de evidențiat pentru o intrare de căutare. */
export function searchFieldOf(item: StudioSearchItem): string {
  return item.field ?? item.id;
}

/**
 * @param opts.interfaceSlug design-ul pe care se rezolvă intrările `interfaceScoped`
 *   (cel deschis acum sau cel implicit al site-ului). Fără el, rămân pe listă.
 */
export function searchStudio(
  query: string,
  opts?: { interfaceSlug?: string | null },
): StudioSearchItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits = STUDIO_SEARCH.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      item.keywords.some((k) => k.toLowerCase().includes(q)),
  );
  const slug = opts?.interfaceSlug?.trim();
  return hits
    .slice(0, 8)
    .map((item) =>
      item.interfaceScoped && slug ? { ...item, href: `/site/interfaces/${slug}` } : item,
    );
}

export function matchStudioPath(pathname: string): {
  id: StudioNavId;
  href: string;
  unknown: boolean;
  catalogKind?: 'styles' | 'occasions' | 'voices';
  interfaceSlug?: string;
} {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/site' || p === '/site/overview') return { id: 'overview', href: '/site', unknown: false };
  if (p === '/site/identity') return { id: 'identity', href: p, unknown: false };
  if (p === '/site/prices') return { id: 'prices', href: p, unknown: false };
  if (p === '/site/appearance') return { id: 'appearance', href: p, unknown: false };
  if (p === '/site/catalog') {
    return { id: 'catalog', href: '/site/catalog/styles', unknown: false, catalogKind: 'styles' };
  }
  if (p === '/site/catalog/styles') return { id: 'catalog', href: p, unknown: false, catalogKind: 'styles' };
  if (p === '/site/catalog/occasions') return { id: 'catalog', href: p, unknown: false, catalogKind: 'occasions' };
  if (p === '/site/catalog/voices') return { id: 'catalog', href: p, unknown: false, catalogKind: 'voices' };
  if (p === '/site/interfaces') return { id: 'interfaces', href: p, unknown: false };
  if (p.startsWith('/site/interfaces/')) {
    const slug = p.slice('/site/interfaces/'.length);
    if (slug && !slug.includes('/')) {
      return { id: 'interfaces', href: p, unknown: false, interfaceSlug: slug };
    }
  }
  if (p === '/site/generation') return { id: 'generation', href: p, unknown: false };
  if (p === '/site/playground') return { id: 'playground', href: p, unknown: false };
  if (p === '/site/operations') return { id: 'operations', href: p, unknown: false };
  if (p === '/site/top') return { id: 'top', href: p, unknown: false };
  if (p.startsWith('/site/')) return { id: 'overview', href: '/site/overview', unknown: true };
  return { id: 'overview', href: '/site', unknown: false };
}

export const STUDIO_FOCUS_KEY = 'mc_studio_focus';

export type StudioFocus = {
  fieldId?: string;
  catalogId?: string;
  catalogKind?: 'styles' | 'occasions' | 'voices';
};

export function setStudioFocus(focus: StudioFocus): void {
  try {
    sessionStorage.setItem(STUDIO_FOCUS_KEY, JSON.stringify(focus));
  } catch {
    /* private mode */
  }
}

export function peekStudioFocus(): StudioFocus | null {
  try {
    const raw = sessionStorage.getItem(STUDIO_FOCUS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StudioFocus;
  } catch {
    return null;
  }
}

export function consumeStudioFocus(): StudioFocus | null {
  const focus = peekStudioFocus();
  try {
    sessionStorage.removeItem(STUDIO_FOCUS_KEY);
  } catch {
    /* ignore */
  }
  return focus;
}

export function highlightStudioField(fieldId: string): void {
  let tries = 0;
  const run = () => {
    const el = document.querySelector(`[data-field="${CSS.escape(fieldId)}"]`);
    if (!(el instanceof HTMLElement)) {
      // ~3s: unele ecrane (ex. un design cu slug custom) își așteaptă întâi
      // lista de la API înainte să randeze ancora.
      if (tries++ < 40) window.setTimeout(run, 80);
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-1', 'ring-primary/50', 'rounded-md');
    window.setTimeout(() => {
      el.classList.remove('ring-1', 'ring-primary/50', 'rounded-md');
    }, 2000);
  };
  window.setTimeout(run, 80);
}

export function isStudioPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  return p === '/site' || p.startsWith('/site/');
}
