import type { SiteDto } from '@/lib/api/sites.api';
import { MASKED_SECRET } from './studio-constants';
import { centsToMajor, currencySuffix } from './money';
import { SITE_NAV, type StudioNavId } from './studio-nav';

const TOP_IGNORE = new Set(['id', 'createdAt', 'updatedAt', 'packagePrices']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function shouldIgnore(path: string): boolean {
  if (TOP_IGNORE.has(path)) return true;
  if (path === 'suno.styleSamples' || path === 'suno.voiceSamples') return true;
  if (path.endsWith('.sampleDefaults') || path.includes('.sampleDefaults.')) return true;
  return false;
}

function isSecretPath(path: string): boolean {
  return (
    path === 'smartbill.token' ||
    path === 'mailConfig.smtp.pass' ||
    path.startsWith('analyticsSecrets.')
  );
}

function secretEqual(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => (v === MASKED_SECRET || v == null || v === '' ? '' : v);
  return norm(a) === norm(b);
}

function emptyEqual(a: unknown, b: unknown): boolean {
  if ((a == null || a === '') && (b == null || b === '')) return true;
  return false;
}

function collect(a: unknown, b: unknown, path: string, out: string[]): void {
  if (path && shouldIgnore(path)) return;
  if (path && isSecretPath(path)) {
    if (!secretEqual(a, b)) out.push(path);
    return;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) out.push(path || '(root)');
    return;
  }
  if (isRecord(a) || isRecord(b)) {
    const left = isRecord(a) ? a : {};
    const right = isRecord(b) ? b : {};
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const k of keys) {
      const next = path ? `${path}.${k}` : k;
      collect(left[k], right[k], next, out);
    }
    return;
  }
  if (emptyEqual(a, b)) return;
  if (a !== b) out.push(path);
}

export function countDirty(site: SiteDto, form: SiteDto): { count: number; paths: string[] } {
  const paths: string[] = [];
  collect(site, form, '', paths);
  return { count: paths.length, paths };
}

const IDENTITY = new Set(['slug', 'domain', 'name', 'locale', 'currency', 'langSwitcherEnabled', 'notes']);
const PRICES = new Set([
  'basePriceCents',
  'standardPriceCents',
  'packagePricesCents',
  'packageCompareAtCents',
  'demoEnabled',
  'stripe',
]);
const APPEARANCE = new Set(['brand', 'seo', 'social', 'testimonials']);
const CATALOG = new Set(['styles', 'voices', 'occasions']);
const GENERATION = new Set(['suno', 'musicEngine', 'lyricsReviewEnabled']);
const TOP = new Set(['topSource', 'topTemplate']);

export function screenForDirtyPath(path: string): StudioNavId {
  const top = path.split('.')[0] ?? path;
  if (IDENTITY.has(top)) return 'identity';
  if (PRICES.has(top)) return 'prices';
  if (APPEARANCE.has(top)) return 'appearance';
  if (CATALOG.has(top)) return 'catalog';
  if (top === 'experienceConfig') return 'interfaces';
  if (GENERATION.has(top)) return 'generation';
  if (TOP.has(top)) return 'top';
  return 'operations';
}

const SKIP_SEGMENTS = new Set([
  'experienceConfig',
  'items',
  'packages',
  'catalog',
  'suno',
  'brand',
  'seo',
  'social',
  'stripe',
  'mailConfig',
  'smartbill',
  'companyInfo',
  'analytics',
  'analyticsSecrets',
  'maintenanceMessage',
]);

const LEAF_LABELS: Record<string, string> = {
  slug: 'Cod intern',
  domain: 'Domeniu',
  name: 'Nume brand',
  locale: 'Limbă',
  currency: 'Valută',
  langSwitcherEnabled: 'Meniu de limbă',
  notes: 'Note interne',
  defaultSlug: 'Interfață implicită',
  enabled: 'Disponibilă',
  musicEngine: 'Motor audio',
  utmRules: 'Reguli UTM',
  writerSystemPrompt: 'Writer',
  writerUserTemplate: 'Cerere writer',
  criticSystemPrompt: 'Editor versuri',
  criticUserTemplate: 'Cerere editor',
  lyricsReviewEnabled: 'Review versuri',
  lyricsLocale: 'Limbă versuri',
  basePrompt: 'Prompt de bază Suno',
  demoIds: 'Demo-uri',
  reactionClips: 'Reacții',
  styles: 'Stiluri',
  occasions: 'Ocazii',
  voices: 'Voci',
  priceCents: 'Preț',
  compareAtCents: 'Preț tăiat',
  remakes: 'Refaceri',
  collage: 'Colaj',
  collagePhotoLimit: 'Limită poze',
  collageFullTrack: 'Piesă întreagă',
  deliveryLabel: 'Livrare (text)',
  label: 'Nume afișat',
  video: 'Videoclip',
  socialImage: 'Imagini social',
  greetingClip: 'Clip de urare AI',
  instrumental: 'Instrumental',
  premiumPage: 'Pagină premium',
  greetingCard: 'Felicitare',
  socialPost: 'Postare social',
  generation: 'Generare',
  durationSec: 'Durată',
  features: 'Lista vitrină',
  upsell: 'Upsell',
  nextSongDiscountPercent: 'Discount manea următoare',
  primaryColor: 'Culoare principală',
  accentColor: 'Culoare accent',
  logoUrl: 'Logo',
  ogImageUrl: 'Imagine de share',
  tagline: 'Tagline',
  faviconUrl: 'Favicon',
  emailBannerUrl: 'Banner email',
  title: 'Titlu SEO',
  description: 'Descriere SEO',
  keywords: 'Keywords SEO',
  testimonials: 'Testimoniale',
  active: 'Site activ',
  sslEnabled: 'SSL',
  maintenanceMode: 'Mentenanță',
  hiddenMode: 'Site ascuns',
  ipWhitelist: 'IP-uri scutite',
  demoEnabled: 'Demo 30s',
  basePriceCents: 'Preț bază',
  standardPriceCents: 'Preț tăiat (vechi)',
  packagePricesCents: 'Prețuri pachete (vechi)',
  packageCompareAtCents: 'Prețuri tăiate (vechi)',
  topSource: 'Sursă top',
  topTemplate: 'Listă top',
  fromEmail: 'From email',
  supportEmail: 'Email support',
  adminEmails: 'Email-uri admin',
  aiChatModeDefault: 'Mod AI chat',
  aiGreetingEnabled: 'Salut AI',
  aiGreetingDelaySec: 'Întârziere salut AI',
  aiGreetingAutoOpenChat: 'Deschide chatul la salut',
  classic: 'Classic',
  cadou: 'Cadou',
  basic: 'Standard',
  plus: 'Plus',
  premium: 'Premium',
};

function uncamel(seg: string): string {
  return seg
    .replace(/Cents$/, '')
    .replace(/Url$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toLowerCase());
}

export function labelDirtyPath(path: string): string {
  const parts = path.split('.').filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    if (SKIP_SEGMENTS.has(part)) continue;
    out.push(LEAF_LABELS[part] ?? uncamel(part));
  }
  return out.join(' · ') || path;
}

export function hrefForDirtyPath(path: string): string {
  const itemMatch = path.match(/^experienceConfig\.items\.([^.]+)/);
  if (itemMatch) return `/site/interfaces/${itemMatch[1]}`;
  if (path === 'experienceConfig.defaultSlug' || path.startsWith('experienceConfig.')) {
    return '/site/interfaces';
  }
  if (path === 'styles' || path.startsWith('styles.')) return '/site/catalog/styles';
  if (path === 'occasions' || path.startsWith('occasions.')) return '/site/catalog/occasions';
  if (path === 'voices' || path.startsWith('voices.')) return '/site/catalog/voices';
  const screen = screenForDirtyPath(path);
  return SITE_NAV.find((n) => n.id === screen)?.href ?? '/site';
}

function getByPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function formatDirtyValue(value: unknown, path: string, currency: string): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'da' : 'nu';
  if (typeof value === 'number') {
    if (/Cents$/i.test(path.split('.').pop() ?? '') || path.endsWith('priceCents') || path.endsWith('compareAtCents')) {
      return `${centsToMajor(value)} ${currencySuffix(currency)}`;
    }
    return String(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.replace(/\s+/g, ' ').trim();
    return trimmed.length > 72 ? `${trimmed.slice(0, 69)}…` : trimmed;
  }
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? 'element' : 'elemente'}`;
  if (typeof value === 'object') return 'modificat';
  return String(value);
}

export interface DirtyChange {
  path: string;
  label: string;
  screen: StudioNavId;
  screenLabel: string;
  href: string;
  from: string;
  to: string;
}

export function describeDirty(
  site: SiteDto,
  form: SiteDto,
): { count: number; paths: string[]; changes: DirtyChange[] } {
  const { count, paths } = countDirty(site, form);
  const currency = form.currency || site.currency || 'RON';
  const changes: DirtyChange[] = paths.map((path) => {
    const screen = screenForDirtyPath(path);
    return {
      path,
      label: labelDirtyPath(path),
      screen,
      screenLabel: SITE_NAV.find((n) => n.id === screen)?.label ?? screen,
      href: hrefForDirtyPath(path),
      from: formatDirtyValue(getByPath(site, path), path, currency),
      to: formatDirtyValue(getByPath(form, path), path, currency),
    };
  });
  return { count, paths, changes };
}
