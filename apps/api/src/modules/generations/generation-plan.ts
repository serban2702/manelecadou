/**
 * „Planul” unei comenzi lansate din admin: ce prompturi ar pleca la GPT și ce
 * tag de stil ar pleca la Suno / Lyria pentru datele completate în modalul
 * „Demo + plată” din chat. Aceeași rezolvare ca în `generations.processor.ts`
 * (catalog per interfață, prompturi per site), ca operatorul să vadă EXACT ce
 * s-ar trimite și să poată edita înainte de lansare.
 *
 * Fișier pur: nu atinge baza, nu apelează OpenAI. Prompturile GPT finale se
 * obțin apoi cu `LyricsService.previewPrompts(plan.lyricsInput, '{{draft}}')`.
 */
import { voiceArtistToGender } from '../../common/voice';
import {
  resolveExperienceGoogleStylePrompt,
  resolveExperienceOccasionEntry,
  resolveExperienceOccasions,
  resolveExperienceStyleEntry,
  resolveExperienceStylePrompt,
  resolveExperienceStyles,
  resolveExperienceWriterPrompt,
} from '../experiences/catalog-resolve';
import { lyricsModelInputs } from '../lyrics/lyrics-model';
import type { LyricsInput } from '../lyrics/lyrics.module';
import type { Site } from '../sites/site.entity';
import { buildSunoStyleTagBody } from '../suno/suno-style-tag';

export interface GenerationPlanParams {
  style: string;
  occasion: string;
  recipientName: string;
  message: string;
  voiceArtist: string;
  dedication?: string;
  tipAmount?: number;
  experienceSlug?: string | null;
  locale?: string;
}

export interface GenerationPlan {
  engine: 'suno' | 'google';
  /** Id-ul de catalog rezolvat (numele afișat e acceptat la intrare — vezi `catalogKey`). */
  styleId: string;
  occasionId: string;
  /** Corpul tag-ului de stil Suno, fără prefixul de gen (se pune la trimitere). */
  sunoStylePrompt: string;
  /** Promptul de stil Lyria (doar când motorul e google). */
  lyriaStylePrompt: string | null;
  lyricsInput: LyricsInput;
  models: { writer: string | null; critic: string | null };
}

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cheia de catalog pentru un stil/ocazie primit din admin. Modalele din chat
 * trimiteau NUMELE afișat („Modernă”, „De iubire”), nu id-ul („modern”,
 * „iubire”): pe producție 200+ comenzi au stilul salvat ca nume, deci
 * `stylePromptMap[style]` nu se potrivea și Suno primea promptul generic.
 * Acceptăm ambele: id exact, apoi nume (fără diacritice, fără majuscule).
 */
export function catalogKey(
  entries: Array<{ id: string; nm?: string }>,
  value: string | null | undefined,
): string {
  const raw = (value ?? '').trim();
  if (!raw) return raw;
  if (entries.some((e) => e.id === raw)) return raw;
  const wanted = fold(raw);
  const byName = entries.find((e) => (e.nm ? fold(e.nm) === wanted : false) || fold(e.id) === wanted);
  return byName?.id ?? raw;
}

export function buildGenerationPlan(site: Site, p: GenerationPlanParams): GenerationPlan {
  const slug = p.experienceSlug || null;
  const styleId = catalogKey(resolveExperienceStyles(site, slug), p.style);
  const occasionId = catalogKey(resolveExperienceOccasions(site, slug), p.occasion);
  const styleEntry = resolveExperienceStyleEntry(site, slug, styleId) ?? site.styles?.find((s) => s.id === styleId);
  const occasionEntry = resolveExperienceOccasionEntry(site, slug, occasionId);
  const voiceEntry = site.voices?.find((v) => v.id === p.voiceArtist);
  const vocalGender = voiceArtistToGender(p.voiceArtist) ?? voiceEntry?.gender;
  const lyricsLocale = p.locale || site.suno?.lyricsLocale || site.locale || 'ro';

  const expEngine = slug ? site.experienceConfig?.items?.[slug]?.musicEngine : undefined;
  const engine: 'suno' | 'google' =
    expEngine === 'google' || expEngine === 'suno' ? expEngine : site.musicEngine === 'google' ? 'google' : 'suno';

  // Exact ca în processor: promptul de stil al interfeței intră peste `stylePromptMap`.
  const expStylePrompt = resolveExperienceStylePrompt(site, slug, styleId);
  const sunoSite = {
    ...site,
    suno: {
      ...site.suno,
      stylePromptMap: {
        ...(site.suno?.stylePromptMap ?? {}),
        ...(expStylePrompt && styleId ? { [styleId]: expStylePrompt } : {}),
      },
    },
  } as Site;

  const sunoStylePrompt = buildSunoStyleTagBody({
    style: styleId,
    occasion: occasionId,
    occasionPrompt: occasionEntry?.sunoPrompt,
    vocalGender,
    site: sunoSite,
  });

  const fallbackLyria =
    lyricsLocale === 'ro'
      ? 'Authentic Romanian manele song with oriental Hijaz scale, darbuka, accordion and violin.'
      : 'Authentic Balkan manele/chalga song with oriental Hijaz scale, darbuka, accordion and violin.';
  const lyriaStylePrompt =
    engine === 'google'
      ? resolveExperienceGoogleStylePrompt(site, slug, styleId) ||
        styleEntry?.googlePrompt?.trim() ||
        expStylePrompt ||
        fallbackLyria
      : null;

  const models = lyricsModelInputs(site.suno);
  const lyricsInput: LyricsInput = {
    style: styleId,
    occasion: occasionId,
    recipientName: p.recipientName,
    message: p.message,
    dedication: p.dedication?.trim() || undefined,
    tipAmount: p.tipAmount,
    voiceArtist: p.voiceArtist,
    locale: lyricsLocale,
    styleHint: styleEntry?.lyricsHint,
    writerSystemPrompt: resolveExperienceWriterPrompt(site, slug) ?? site.suno?.writerSystemPrompt,
    writerUserTemplate: site.suno?.writerUserTemplate,
    criticSystemPrompt: site.suno?.criticSystemPrompt,
    criticUserTemplate: site.suno?.criticUserTemplate,
    currency: site.currency,
    siteId: site.id,
    generationId: null,
    ...models,
  };

  return {
    engine,
    styleId,
    occasionId,
    sunoStylePrompt,
    lyriaStylePrompt,
    lyricsInput,
    models: {
      writer: models.writerModel?.model ?? null,
      critic: models.criticModel?.model ?? null,
    },
  };
}
