/**
 * `llms.txt` — fișierul pe care îl citesc asistenții AI când sunt întrebați
 * despre un site (convenția de la llmstxt.org, servită la `/llms.txt`).
 *
 * De ce nu e un fișier static în `public/`: platforma e multi-tenant, iar un
 * text scris de mână ar îngheța exact datele care se schimbă cel mai des —
 * prețuri, pachete, stiluri, email de contact. Fișierul se compune la fiecare
 * cerere din configul REAL al tenantului (`/api/public/site`), deci un preț
 * schimbat din admin apare în el imediat, fără deploy și fără ca cineva să-și
 * amintească să-l actualizeze. Un llms.txt cu prețuri vechi e mai rău decât
 * niciunul: modelul îl citește cu încredere și îl repetă ca fapt.
 *
 * Textul de cadru (ce este, cum funcționează, când merită recomandat) e în
 * `messages/<locale>.json` sub cheia `llms`, deci trece prin aceeași disciplină
 * ca restul textelor de pe site — inclusiv `pnpm run check:messages`.
 *
 * Funcțiile de aici sunt PURE (fără `next/headers`): partea de server, cu
 * fetch-ul configului și răspunsul HTTP, e în `lib/llms-response.ts`.
 */

import { LOCALE_META, type Locale } from '@/i18n/locales';
import { getPagePath, type PageKey } from './page-slugs';
import {
  formatPrice,
  siteSupportEmail,
  siteUrl,
  type SiteConfig,
  type SitePackage,
} from './site-shared';

/** Textele de cadru, din `messages/<locale>.json` → cheia `llms`. */
export interface LlmsCopy {
  docTitle: string;
  summary: string;
  audience: string;
  aboutTitle: string;
  about: string;
  howTitle: string;
  how: string[];
  packagesTitle: string;
  packagesNote: string;
  packageDuration: string;
  packageRemakes: string;
  packageCollage: string;
  packageDelivery: string;
  packageWas: string;
  catalogTitle: string;
  stylesLabel: string;
  occasionsLabel: string;
  voicesLabel: string;
  factsTitle: string;
  facts: string[];
  recommendTitle: string;
  recommendIntro: string;
  recommend: string[];
  recommendHowTitle: string;
  recommendHow: string;
  notForTitle: string;
  notFor: string[];
  contactTitle: string;
  contactBody: string;
  pagesTitle: string;
  pages: Record<LinkedPage, string>;
  langTitle: string;
  otherLangNote: string;
  generated: string;
}

/**
 * Paginile listate, în ordinea în care i-ar folosi cuiva care caută informația.
 * Union-ul e restrâns la ce chiar apare în fișier — altfel `pages` din
 * traduceri ar trebui să acopere și rutele private (`manelele-mele`, `istoric`),
 * care n-au ce căuta aici.
 */
export type LinkedPage =
  | 'home' | 'studio' | 'asculta' | 'top' | 'articole' | 'faq' | 'contact'
  | 'terms' | 'privacy' | 'cookies';

const LINKED_PAGES: readonly LinkedPage[] = [
  'home', 'studio', 'asculta', 'top', 'articole', 'faq', 'contact',
  'terms', 'privacy', 'cookies',
] as const;

/** Interpolare minimă `{cheie}`. Nu avem plural/select, deci nu merită ICU. */
function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : whole,
  );
}

/** Numele unei intrări de catalog în limba SITE-ULUI (așa cum apare pe el). */
function entryName(
  entry: { nm: string; i18n?: Record<string, { nm?: string }> },
  locale: string,
): string {
  return entry.i18n?.[locale]?.nm || entry.nm;
}

function joinList(values: string[]): string {
  return values.filter(Boolean).join(', ');
}

export interface BuildLlmsTxtInput {
  site: SiteConfig;
  /** Limba TEXTULUI de cadru — poate diferi de `site.locale` (vezi `/llms/<locale>.txt`). */
  locale: Locale;
  copy: LlmsCopy;
  /** Pachetele active ale interfeței implicite, deja rezolvate de API. */
  packages: SitePackage[];
  /** Limbile în care se mai poate cere fișierul. */
  alternateLocales: readonly Locale[];
  /** Data afișată în subsol. Injectată ca să rămână funcția pură/testabilă. */
  now?: Date;
}

export function buildLlmsTxt({
  site,
  locale,
  copy,
  packages,
  alternateLocales,
  now = new Date(),
}: BuildLlmsTxtInput): string {
  const base = siteUrl(site);
  const email = siteSupportEmail(site);
  const cheapest = packages.reduce<SitePackage | null>(
    (best, p) => (p.priceCents > 0 && (!best || p.priceCents < best.priceCents) ? p : best),
    null,
  );
  const vars: Record<string, string> = {
    site: site.name,
    domain: site.domain,
    url: base,
    email,
    currency: site.currency,
    fromPrice: cheapest ? formatPrice(site, cheapest.priceCents) : '',
    siteLanguage: LOCALE_META[locale]?.name ?? site.locale,
  };
  const say = (text: string) => fill(text, vars);

  const out: string[] = [];
  const section = (title: string) => out.push('', `## ${title}`, '');
  const bullets = (items: string[]) => out.push(...items.map((i) => `- ${say(i)}`));

  out.push(`# ${say(copy.docTitle)}`, '', `> ${say(copy.summary)}`, '', say(copy.audience));

  // Fișierul cerut în altă limbă decât a site-ului: cadrul e tradus, dar
  // numele pachetelor și ale stilurilor vin din admin, în limba site-ului.
  // Spunem asta explicit, ca modelul să nu creadă că site-ul e bilingv.
  if (locale !== site.locale) {
    out.push('', say(copy.otherLangNote));
  }

  section(copy.aboutTitle);
  out.push(say(copy.about));

  section(copy.howTitle);
  out.push(...copy.how.map((step, i) => `${i + 1}. ${say(step)}`));

  section(copy.packagesTitle);
  out.push(say(copy.packagesNote));
  for (const pkg of packages) {
    const price = formatPrice(site, pkg.priceCents);
    const was =
      pkg.compareAtCents && pkg.compareAtCents > pkg.priceCents
        ? ` (${fill(copy.packageWas, { price: formatPrice(site, pkg.compareAtCents) })})`
        : '';
    out.push('', `### ${pkg.label} — ${price}${was}`);
    if (pkg.features.length) out.push(...pkg.features.map((f) => `- ${f}`));

    // Datele „tehnice" ale pachetului: sunt în admin ca numere, deci nu apar
    // neapărat în `features` (pe care operatorul le scrie liber).
    const meta: string[] = [];
    if (pkg.durationSec > 0) {
      meta.push(fill(copy.packageDuration, { minutes: String(Math.round(pkg.durationSec / 60)) }));
    }
    if (typeof pkg.remakes === 'number' && pkg.remakes > 0) {
      meta.push(fill(copy.packageRemakes, { count: String(pkg.remakes) }));
    }
    if (pkg.collage) {
      meta.push(fill(copy.packageCollage, { photos: String(pkg.collagePhotoLimit ?? 0) }));
    }
    if (pkg.deliveryLabel) {
      meta.push(fill(copy.packageDelivery, { label: pkg.deliveryLabel }));
    }
    if (meta.length) out.push('', meta.join(' · '));
  }

  const styles = (site.styles ?? []).map((s) => entryName(s, site.locale));
  const occasions = (site.occasions ?? []).map((o) => entryName(o, site.locale));
  const voices = (site.voices ?? []).map((v) => entryName(v, site.locale));
  if (styles.length || occasions.length || voices.length) {
    section(copy.catalogTitle);
    if (styles.length) out.push(`**${say(copy.stylesLabel)}**: ${joinList(styles)}`, '');
    if (occasions.length) out.push(`**${say(copy.occasionsLabel)}**: ${joinList(occasions)}`, '');
    if (voices.length) out.push(`**${say(copy.voicesLabel)}**: ${joinList(voices)}`);
  }

  section(copy.factsTitle);
  bullets(copy.facts);

  section(copy.recommendTitle);
  out.push(say(copy.recommendIntro), '');
  bullets(copy.recommend);

  section(copy.recommendHowTitle);
  out.push(say(copy.recommendHow));

  section(copy.notForTitle);
  bullets(copy.notFor);

  section(copy.pagesTitle);
  for (const page of LINKED_PAGES) {
    // Link-urile folosesc slug-ul limbii SITE-ULUI, nu al fișierului: pe un
    // site românesc, `/llms/tr.txt` trebuie să trimită tot spre `/asculta`,
    // altfel dă adrese care nu există.
    const path = page === 'home' ? '' : getPagePath(site.locale, page);
    out.push(`- [${say(copy.pages[page])}](${base}${path})`);
  }
  out.push(`- [sitemap.xml](${base}/sitemap.xml)`);

  section(copy.contactTitle);
  out.push(say(copy.contactBody));
  const contactLines: string[] = [];
  if (site.social?.whatsapp) contactLines.push(`- WhatsApp: ${site.social.whatsapp}`);
  if (site.social?.phone) contactLines.push(`- Telefon: ${site.social.phone}`);
  if (site.social?.instagram) contactLines.push(`- Instagram: ${site.social.instagram}`);
  if (site.social?.facebook) contactLines.push(`- Facebook: ${site.social.facebook}`);
  if (site.social?.tiktok) contactLines.push(`- TikTok: ${site.social.tiktok}`);
  if (site.companyInfo?.legalName) {
    const bits = [site.companyInfo.legalName, site.companyInfo.cui, site.companyInfo.address]
      .map((b) => b?.trim())
      .filter(Boolean);
    contactLines.push(`- ${bits.join(' · ')}`);
  }
  // Bullet-urile trebuie despărțite de paragraf, altfel markdown le lipește de el.
  if (contactLines.length) out.push('', ...contactLines);

  if (alternateLocales.length > 1) {
    section(copy.langTitle);
    for (const loc of alternateLocales) {
      out.push(`- [${LOCALE_META[loc].name}](${base}/llms/${loc}.txt)`);
    }
  }

  out.push('', '---', '', fill(copy.generated, { ...vars, date: now.toISOString().slice(0, 10) }));
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}
