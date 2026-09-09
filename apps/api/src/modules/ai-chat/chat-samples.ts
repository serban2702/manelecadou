/**
 * Mostrele audio pe care Irina le poate pune în chat.
 *
 * Regula (cerere owner, 10 sep 2026): exemplele sunt EXACT stilurile muzicale
 * afișate pe site pentru interfața pe care se află clientul — nici mai multe,
 * nici altele. Înainte, agentul lua cheile din `suno.styleSamples` la valoarea
 * nominală, deci pe `manelecadou.ro` putea trimite „kuchek" sau „tallava",
 * stiluri care nu apar nicăieri pe site, plus mostre de voce pe nume de artiști
 * fictivi (gigi, nicu, mariana) care nu mai există în catalogul public.
 *
 * Fișierul e PUR (fără NestJS) ca să fie testabil și ca regula „ce stiluri vede
 * clientul" să fie aceeași cu cea din web — vezi
 * `apps/web/experiences/use-experience-catalog.ts` + `cadou/styles.ts`, pe care
 * le oglindește. Dacă schimbi una, schimb-o și pe cealaltă.
 */
import type { Site, SiteSampleEntry, SiteStyleEntry, SiteVoiceEntry } from '../sites/site.entity';
import { experienceCatalogOf } from '../experiences/catalog-resolve';

export type ChatSampleKind = 'style' | 'voice';

export interface ChatSample {
  kind: ChatSampleKind;
  id: string;
  /** Numele afișat pe site, în limba site-ului. */
  name: string;
  /** Descrierea scurtă de pe card (stil: `ds`, voce: `tg`). */
  description: string;
  audioUrl: string;
  /** Secunda de la care pornește redarea (skip intro), ca pe site. */
  startSec: number;
}

export type ChatSampleSite = Pick<Site, 'styles' | 'voices' | 'experienceConfig' | 'suno'> & {
  locale?: string | null;
};

/**
 * Seed-ul românesc de stiluri — oglinda lui `apps/web/lib/seed-data.ts` (doar
 * id/nume/descriere). Intră în joc DOAR pentru site-urile fără catalog propriu,
 * exact ca pe web. Ține-l sincronizat cu seed-ul din web.
 */
export const SEED_STYLES: ReadonlyArray<Pick<SiteStyleEntry, 'id' | 'nm' | 'ds'>> = [
  { id: 'clasic', nm: 'Clasică de pahar', ds: 'Acordeon, lăutărească' },
  { id: 'modern', nm: 'Modernă', ds: 'Trap-manea, beat tare' },
  { id: 'oriental', nm: 'Orientală', ds: 'Darbuka, melisme' },
  { id: 'trompeta', nm: 'Cu trompetă', ds: 'Banda de fanfare' },
  { id: 'romantica', nm: 'De jale', ds: 'Pentru inimi frânte' },
  { id: 'comerciala', nm: 'Comercială', ds: 'De club, de sezon' },
  { id: 'opulenta', nm: 'De opulență', ds: 'Banii curg, lux total' },
  { id: 'iubire', nm: 'De iubire', ds: 'Romantic pur, dulce' },
  { id: 'tallava', nm: 'Tallava', ds: 'Ritm balcanic, BG/MK' },
  { id: 'kuchek', nm: 'Kuchek', ds: 'Ritm rom bulgăresc' },
  { id: 'trapanele', nm: 'Trapanele', ds: 'Trap × manea, hard' },
  { id: 'pahar', nm: 'De pahar', ds: 'Petrecere, voie bună' },
];

export const SEED_VOICES: ReadonlyArray<Pick<SiteVoiceEntry, 'id' | 'nm' | 'tg'>> = [
  { id: 'male', nm: 'Bărbătească', tg: 'Voce de bărbat' },
  { id: 'female', nm: 'Feminină', tg: 'Voce de femeie' },
];

/** Selecția fixă a interfeței cadou — oglinda lui `apps/web/experiences/cadou/styles.ts`. */
const CADOU_STYLES: Array<{ id: string; nmFrom?: string }> = [
  { id: 'iubire' },
  { id: 'romantica' },
  { id: 'clasic', nmFrom: 'pahar' },
  { id: 'opulenta' },
  { id: 'trompeta' },
  { id: 'oriental' },
];
const CADOU_STYLE_COUNT = 6;
const CADOU_MIN_MATCHES = 3;

type StyleLike = Pick<SiteStyleEntry, 'id' | 'nm' | 'ds' | 'i18n'> & {
  sampleUrl?: string;
  sampleStartSec?: number;
};

function resolveCadouStyles(siteStyles: StyleLike[] | null | undefined): StyleLike[] {
  const own = siteStyles ?? [];
  if (own.length > 0) {
    const byId = new Map(own.map((s) => [s.id, s] as const));
    const picked = pickCadou(byId);
    if (picked.length >= CADOU_MIN_MATCHES) return picked.slice(0, CADOU_STYLE_COUNT);
    return own.slice(0, CADOU_STYLE_COUNT);
  }
  const byId = new Map<string, StyleLike>(SEED_STYLES.map((s) => [s.id, { ...s }] as const));
  return pickCadou(byId);
}

function pickCadou(byId: Map<string, StyleLike>): StyleLike[] {
  const out: StyleLike[] = [];
  for (const want of CADOU_STYLES) {
    const src = byId.get(want.id);
    if (!src) continue;
    const alias = want.nmFrom ? byId.get(want.nmFrom) : undefined;
    if (!alias) {
      out.push(src);
      continue;
    }
    // Numele (și traducerile lui) vin de la stilul împrumutat; descrierea rămâne a lui.
    const i18n: StyleLike['i18n'] = {};
    for (const loc of new Set([...Object.keys(src.i18n ?? {}), ...Object.keys(alias.i18n ?? {})])) {
      i18n[loc] = { ...(src.i18n?.[loc] ?? {}), nm: alias.i18n?.[loc]?.nm ?? src.i18n?.[loc]?.nm };
    }
    out.push({ ...src, nm: alias.nm, i18n });
  }
  return out;
}

/** Stilurile afișate pe interfața `slug` a site-ului — aceeași ordine ca pe site. */
export function resolveExperienceStyleList(site: ChatSampleSite | null | undefined, slug: string | null | undefined): StyleLike[] {
  const cat = experienceCatalogOf(site as Site | null | undefined, slug);
  if (cat?.styles?.length) return cat.styles as StyleLike[];
  if (slug === 'cadou') return resolveCadouStyles(site?.styles as StyleLike[] | undefined);
  if (site?.styles?.length) return site.styles as StyleLike[];
  return SEED_STYLES.map((s) => ({ ...s }));
}

function normLocale(locale: string | null | undefined): string {
  return (locale ?? '').trim().toLowerCase().split('-')[0];
}

/**
 * Mostrele de STIL disponibile clientului: stilurile interfeței lui, doar cele
 * care au audio (`catalog.styles[].sampleUrl` are prioritate, apoi
 * `suno.styleSamples[id]`, exact ca în `useExperienceCatalog.styleSamples`).
 */
export function resolveChatStyleSamples(
  site: ChatSampleSite | null | undefined,
  slug: string | null | undefined,
  locale?: string | null,
): ChatSample[] {
  if (!site) return [];
  const loc = normLocale(locale ?? site.locale);
  const presets: Record<string, SiteSampleEntry> = site.suno?.styleSamples ?? {};
  const out: ChatSample[] = [];
  for (const s of resolveExperienceStyleList(site, slug)) {
    const preset = presets[s.id];
    const audioUrl = (s.sampleUrl && s.sampleUrl.trim()) || preset?.audioUrl?.trim() || '';
    if (!audioUrl) continue;
    const startSec = s.sampleUrl ? Math.max(0, s.sampleStartSec ?? 0) : Math.max(0, preset?.startSec ?? 0);
    out.push({
      kind: 'style',
      id: s.id,
      name: s.i18n?.[loc]?.nm || s.nm || s.id,
      description: s.i18n?.[loc]?.ds || s.ds || '',
      audioUrl,
      startSec,
    });
  }
  return out;
}

/** Mostrele de VOCE: vocile interfeței (male/female pe seed), doar cele cu audio. */
export function resolveChatVoiceSamples(
  site: ChatSampleSite | null | undefined,
  slug: string | null | undefined,
  locale?: string | null,
): ChatSample[] {
  if (!site) return [];
  const loc = normLocale(locale ?? site.locale);
  const cat = experienceCatalogOf(site as Site | null | undefined, slug);
  type VoiceLike = { id: string; nm: string; tg?: string; i18n?: Record<string, { nm?: string; tg?: string }> };
  const voices: VoiceLike[] = cat?.voices?.length
    ? cat.voices
    : site.voices?.length
      ? site.voices
      : SEED_VOICES.map((v) => ({ ...v }));
  const presets: Record<string, SiteSampleEntry> = site.suno?.voiceSamples ?? {};
  const out: ChatSample[] = [];
  for (const v of voices) {
    const preset = presets[v.id];
    if (!preset?.audioUrl) continue;
    out.push({
      kind: 'voice',
      id: v.id,
      name: v.i18n?.[loc]?.nm || v.nm || v.id,
      description: v.i18n?.[loc]?.tg || v.tg || '',
      audioUrl: preset.audioUrl,
      startSec: Math.max(0, preset.startSec ?? 0),
    });
  }
  return out;
}

// ───────────────────────── potrivire text ↔ mostre ─────────────────────────

/** Fără diacritice, lowercase, doar litere/cifre și spații. */
export function normText(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9Ѐ-ӿͰ-Ͽ]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Cuvintele de legătură din numele stilurilor („De iubire", „Cu trompetă"). */
const NAME_FILLER = new Set(['de', 'cu', 'la', 'si', 'in', 'pe', 'the', 'of']);

/** Rădăcinile după care recunoaștem o mostră într-un text liber. */
function sampleStems(s: ChatSample): string[] {
  const stems = new Set<string>();
  const nameTokens = normText(s.name).split(' ').filter((t) => t && !NAME_FILLER.has(t));
  const tokens = nameTokens.length ? nameTokens : normText(s.name).split(' ').filter(Boolean);
  for (const t of tokens) {
    if (t.length < 3) continue;
    stems.add(t.length > 5 ? t.slice(0, 5) : t);
  }
  const id = normText(s.id).replace(/ /g, '');
  if (id.length >= 5) stems.add(id);
  return [...stems];
}

/**
 * Mostrele numite într-un text (mesajul userului sau al Irinei). Potrivirea e pe
 * rădăcini de cuvânt — „vreau una moderna", „ceva de jale", „cu trompete" — ca să
 * prindă flexiunile fără să inventeze: fiecare rădăcină trebuie să înceapă un cuvânt.
 */
export function findMentionedSamples(text: string, samples: ChatSample[]): ChatSample[] {
  const words = normText(text).split(' ').filter(Boolean);
  if (!words.length) return [];
  const out: ChatSample[] = [];
  for (const s of samples) {
    const stems = sampleStems(s);
    if (!stems.length) continue;
    const hit = stems.some((stem) => words.some((w) => w === stem || (stem.length >= 5 && w.startsWith(stem))));
    if (hit) out.push(s);
  }
  return out;
}

/** Cel mai apropiat id/nume din listă pentru ce a cerut modelul (sau userul). */
export function matchSample(samples: ChatSample[], query: string): ChatSample | undefined {
  const q = normText(query).replace(/^(de|cu|stil|stilul|stilului|manea|maneaua|voce|vocea) /, '').trim();
  if (!q) return undefined;
  const qId = q.replace(/ /g, '');
  const byId = samples.find((s) => normText(s.id).replace(/ /g, '') === qId);
  if (byId) return byId;
  const byName = samples.find((s) => normText(s.name) === q);
  if (byName) return byName;
  const mentioned = findMentionedSamples(query, samples);
  if (mentioned.length === 1) return mentioned[0];
  const loose = samples.find((s) => {
    const id = normText(s.id).replace(/ /g, '');
    const name = normText(s.name);
    return id.startsWith(qId) || qId.startsWith(id) || name.includes(q) || q.includes(name);
  });
  return loose ?? (mentioned.length ? mentioned[0] : undefined);
}

/** Un text al Irinei care ENUMERĂ stilurile (i-a pus clientului întrebarea „ce stil vrei?"). */
export function enumeratesStyles(text: string, samples: ChatSample[]): boolean {
  if (samples.length === 0) return false;
  const need = Math.min(2, samples.length);
  return findMentionedSamples(text, samples).length >= need;
}

/** Link brut către o mostră/fișier audio — se trimite doar prin player, niciodată în text. */
export function containsRawAudioLink(text: string): boolean {
  return /https?:\/\/\S+\.(mp3|m4a|wav|ogg|aac)(\?|#|\s|$)/i.test(text) || /\/site-samples\//i.test(text);
}

export type SampleDecision =
  | { action: 'play'; sample: ChatSample; corrected: boolean }
  | { action: 'ask' }
  | { action: 'not_found' };

/**
 * Decide DETERMINIST ce face `play_sample` la o cerere de mostră de stil.
 *
 * Cererea owner-ului: la „vreau un demo / cum sună?" Irina întreabă ÎNTÂI ce stil
 * vrea omul și îi enumeră stilurile, apoi trimite. Modelul sare ușor pasul (alege
 * el un stil), așa că regula stă aici, nu doar în prompt. Mostra pleacă direct
 * doar când stilul e ales de client: l-a numit el, l-a ales deja în comandă, sau
 * a răspuns la enumerarea Irinei (cu numele, cu numărul, cu „primul").
 */
export function decideStyleSample(input: {
  requested: string;
  samples: ChatSample[];
  /** Mesajul curent al userului (cel care a declanșat turul). */
  userText: string;
  /** `true` dacă mesajul userului e doar „da/ok/te rog" — răspuns la o ofertă a Irinei. */
  userAffirmOnly: boolean;
  /** Textele Irinei din conversație, cel mai recent primul. */
  recentAiTexts: string[];
  /** Stilul deja ales în comandă (wizard), dacă există. */
  wizardStyle?: string | null;
}): SampleDecision {
  const { samples } = input;
  if (samples.length === 0) return { action: 'not_found' };
  const requested = matchSample(samples, input.requested);
  const mentionedByUser = findMentionedSamples(input.userText, samples);

  // Userul a numit exact un stil → pe ăla îl pune, chiar dacă modelul a cerut altul.
  if (mentionedByUser.length === 1) {
    const s = mentionedByUser[0];
    return { action: 'play', sample: s, corrected: !requested || requested.id !== s.id };
  }
  if (!requested) return mentionedByUser.length ? { action: 'play', sample: mentionedByUser[0], corrected: true } : { action: 'not_found' };
  if (mentionedByUser.some((s) => s.id === requested.id)) return { action: 'play', sample: requested, corrected: false };

  // Stilul e deja ales în comandă (wizard) și e cel cerut → nu mai întrebăm.
  if (input.wizardStyle && matchSample(samples, input.wizardStyle)?.id === requested.id) {
    return { action: 'play', sample: requested, corrected: false };
  }

  // Irina a enumerat deja stilurile (în ultimele mesaje) → userul a răspuns (cu nume
  // pe care nu l-am prins, cu număr, „primul", „oricare") → lăsăm modelul să aleagă.
  const lastAi = input.recentAiTexts[0] ?? '';
  if (input.recentAiTexts.slice(0, 4).some((t) => enumeratesStyles(t, samples))) {
    return { action: 'play', sample: requested, corrected: false };
  }
  // Irina a oferit exact această mostră („vrei să auzi una de jale?") și userul a zis „da".
  if (input.userAffirmOnly && findMentionedSamples(lastAi, samples).some((s) => s.id === requested.id)) {
    return { action: 'play', sample: requested, corrected: false };
  }
  return { action: 'ask' };
}
