import type { SunoGenerateInput } from './suno.types';
import { occasionThemeEn } from './suno-i18n';

/**
 * Construirea tag-ului de stil pentru Suno — extras din provider ca fișier PUR.
 *
 * Există ca modalul „Demo + plată” din admin să poată arăta operatorului EXACT
 * tag-ul care ar pleca la Suno pentru comanda lui (același cod, nu o copie) și
 * să-l lase să-l editeze. Prefixul de gen vocal se pune SEPARAT, la trimitere,
 * de aceea `buildSunoStyleTagBody` îl exclude: un tag editat și trimis înapoi
 * ca `styleOverride` primește prefixul o singură dată, nu de două ori.
 */

type StyleInput = Pick<SunoGenerateInput, 'style' | 'occasion' | 'occasionPrompt' | 'vocalGender' | 'site'>;

export function sunoGenderTag(gender?: 'm' | 'f'): string {
  return gender === 'f'
    ? 'female vocals only, woman singer, '
    : gender === 'm'
      ? 'male vocals only, man singer, '
      : '';
}

/**
 * Aliniază mențiunile de gen vocal dintr-un text de style/prompt cu genul
 * cerut explicit. `\bmale\b` NU se potrivește în "female" (și invers
 * `\bman\b` nu prinde "woman", nici "Romanian") — word boundary garantează asta.
 * Versurile (lyrics) NU trec niciodată prin această funcție — sunt cântate literal.
 */
export function alignVocalGender(text: string, gender?: 'm' | 'f'): string {
  if (!text || (gender !== 'm' && gender !== 'f')) return text;
  if (gender === 'f') {
    return text.replace(/\bmale\b/gi, 'female').replace(/\bman\b/gi, 'woman');
  }
  return text.replace(/\bfemale\b/gi, 'male').replace(/\bwoman\b/gi, 'man');
}

export function occasionStyleHint(i: Pick<SunoGenerateInput, 'occasion' | 'occasionPrompt'>): string {
  const extra = i.occasionPrompt?.trim();
  if (extra) return `, ${extra}`;
  // Fără `sunoPrompt` configurat pe ocazie, aici ajungea IDENTIFICATORUL intern:
  // „themed for zi" pe bulgară, „themed for genethlia" pe greacă — cuvinte fără
  // sens pentru model, într-un tag altfel integral în engleză. Pe producție
  // niciuna dintre cele 24 de ocazii bg/el nu are `sunoPrompt`, deci era cazul
  // obișnuit, nu excepția. Traducem în engleză; ce nu putem traduce, omitem.
  const theme = occasionThemeEn(i.occasion);
  return theme ? `, themed for ${theme}` : '';
}

/** Style tag WYSIWYG (playground / override din admin): păstrăm textul dat, doar aliniem genul vocal. */
export function styleOverrideTag(raw: string, gender?: 'm' | 'f'): string {
  return sunoGenderTag(gender) + alignVocalGender(raw.trim(), gender);
}

/**
 * Corpul tag-ului de stil, FĂRĂ prefixul de gen vocal (vezi antetul fișierului).
 *
 * Per-site overrides:
 *   - site.suno.stylePromptMap[style] — override complet pentru un stil
 *   - site.suno.basePrompt            — înlocuiește CORE-ul default
 */
export function buildSunoStyleTagBody(i: StyleInput): string {
  const siteSuno = i.site?.suno;
  const styleOverride = siteSuno?.stylePromptMap?.[i.style];
  if (styleOverride) {
    const occasionHint = occasionStyleHint(i);
    return alignVocalGender(`${styleOverride}${occasionHint}`, i.vocalGender);
  }
  // Bază obligatorie: scări orientale + instrumentație + vocal style autentic manele.
  // IMPORTANT: NU includem nume de artiști reali — Suno respinge tag-urile cu artist names
  // (SENSITIVE_WORD_ERROR: "we don't reference specific artists"). Descriem doar
  // caracteristici sonore.
  //
  // Când vocalGender e setat explicit (parametru direct Suno + genderTag), folosim
  // descriptor neutru ca să nu intre în conflict cu cererea (ex. voce feminină).
  const vocalDescriptor = i.vocalGender
    ? 'ornamented melismatic vocal with heavy auto-tune, pitch slides and "of/aoleu" interjections'
    : 'ornamented melismatic male vocal with heavy auto-tune, pitch slides and "of/aoleu" interjections';
  const CORE = siteSuno?.basePrompt ??
    'Romanian MANELE (NOT pop, NOT EDM, NOT generic dance, NOT trap-rap), authentic balkan gypsy pop, classic Romanian wedding-band manele tradition (Pitești / București scene, late 90s through 2010s era), ' +
    `Hijaz Phrygian-dominant oriental scale, ${vocalDescriptor}, ` +
    'darbuka derbeke percussion, finger cymbals, oriental synth lead (Korg Pa keyboard, taksim), ' +
    'accordion runs, violin glissando, clarinet trills, deep dumbek kick, fast hi-hat triplets, Romanian language';

  const styleMap: Record<string, string> = {
    clasic:
      'classic lăutărească manele, traditional gypsy wedding band, live accordion, violin lăutar, ' +
      'cobză strumming, sweet melancholic male voice, 90s Romanian manele sound, mid tempo 95 BPM',
    modern:
      'modern manele 2020s, trap-manea production, oriental synth over 808 sub-bass, ' +
      'auto-tune heavy male vocal, melismatic runs, hi-hat rolls, early-2010s Romanian commercial-manele production sound, 100 BPM',
    oriental:
      'heavy oriental manele, turkish arabic flavor, oud and saz, darbuka groove, ' +
      'maqam Hijaz scale, melismatic crying vocal, ney flute fills, slow 85 BPM',
    trompeta:
      'manele cu trompetă, balkan brass band fanfare style, blasting trumpets and trombones, ' +
      'gypsy fanfara ciocărlia energy, accordion lead, fast 120 BPM dance',
    romantica:
      'manea de dragoste romantica, heartbreak ballad, oriental sad scale, ' +
      'crying male vocal with sobs and falsetto runs, soft accordion, weeping violin, slow 70 BPM',
    comerciala:
      'manele comerciale de club, oriental hook with club-energy chorus, manele DNA stays dominant, ' +
      'auto-tune melismatic male vocal, oriental synth lead, darbuka groove with modern kick, party energy, 105 BPM',
    opulenta:
      'manele de bani, opulent luxury manele, șmecher boss vibe, brass stabs and oriental synth, ' +
      'auto-tune male vocal bragging tone, big money references, 100 BPM',
    iubire:
      'manea de iubire romantica, warm tender male vocal, ornamented melisma, ' +
      'soft accordion, violin counter-melody, oriental scale, mid tempo 90 BPM',
    tallava:
      'Balkan tallava, Albanian Macedonian roma manele fusion, frantic clarinet solos, ' +
      'rapid accordion runs, darbuka and tapan drums, oriental scale, fast 130 BPM dance',
    kuchek:
      'Bulgarian Roma kuchek, 9/8 odd-meter dance, blasting brass band, ' +
      'darbuka and tapan, accordion ornaments, fanfare energy, 130 BPM',
    trapanele:
      'romanian trap-manele where manele DNA dominates the trap beat, oriental Hijaz synth lead carries the melody, ' +
      'darbuka layered over trap 808s, melismatic manele male vocal with auto-tune (sung manele, NOT rap), ' +
      'hi-hat triplets stay subtle so accordion and oriental synth remain front, 130-140 BPM',
    pahar:
      'manea de pahar petrecere, festive drinking song, live wedding band feel, ' +
      'accordion and violin trade solos, hand claps, glasses clinking, celebratory shouts, 100 BPM',
  };

  const styleText = styleMap[i.style] ?? `${i.style} manele subgenre`;
  const occasionHint = occasionStyleHint(i);
  return alignVocalGender(`${CORE}, ${styleText}${occasionHint}`, i.vocalGender);
}

/**
 * Tag-ul complet: prefix explicit de gen la ÎNCEPUT (nu la final, ca să nu cadă
 * la truncate) + corpul aliniat. Sursele (basePrompt per-site din DB,
 * stylePromptMap, styleMap hardcodat) conțin istoric "male vocal" — nealiniate,
 * contrazic parametrul vocalGender și Suno generează voce greșită la comenzile
 * cu voce feminină.
 */
export function buildSunoStyleTag(i: StyleInput): string {
  return sunoGenderTag(i.vocalGender) + buildSunoStyleTagBody(i);
}
