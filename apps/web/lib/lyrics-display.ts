/**
 * Curăță versurile pentru afișare client-side: marker-ele Suno gen [Chorus],
 * [Verse 1], [Outro 2] sunt traduse în limba userului. La Suno se trimite
 * tot textul brut (cu marker-ele EN) — aici doar afișăm prettify.
 *
 * Markerele recunoscute (case-insensitive, eventual sufix numeric):
 *   intro, spoken intro, verse, pre-chorus, chorus, hook, bridge, drop,
 *   interlude, outro, spoken outro.
 */

export type LyricsLocale =
  | 'ro' | 'bg' | 'sr' | 'tr' | 'el' | 'hr' | 'sl' | 'bs';

type TagKey =
  | 'intro' | 'spoken-intro' | 'verse' | 'pre-chorus' | 'chorus'
  | 'hook' | 'bridge' | 'drop' | 'interlude' | 'outro' | 'spoken-outro';

const TAG_LABELS: Record<LyricsLocale, Record<TagKey, string>> = {
  ro: {
    intro: 'Intro', 'spoken-intro': 'Intro vorbit', verse: 'Strofa',
    'pre-chorus': 'Pre-refren', chorus: 'Refren', hook: 'Hook',
    bridge: 'Punte', drop: 'Drop', interlude: 'Interludiu',
    outro: 'Outro', 'spoken-outro': 'Outro vorbit',
  },
  bg: {
    intro: 'Интро', 'spoken-intro': 'Изговорено интро', verse: 'Куплет',
    'pre-chorus': 'Пред-припев', chorus: 'Припев', hook: 'Хук',
    bridge: 'Мост', drop: 'Дроп', interlude: 'Интерлюдия',
    outro: 'Аутро', 'spoken-outro': 'Изговорено аутро',
  },
  sr: {
    intro: 'Интро', 'spoken-intro': 'Говорни увод', verse: 'Строфа',
    'pre-chorus': 'Пред-рефрен', chorus: 'Рефрен', hook: 'Хук',
    bridge: 'Мост', drop: 'Дроп', interlude: 'Интерлудијум',
    outro: 'Аутро', 'spoken-outro': 'Говорни крај',
  },
  tr: {
    intro: 'Giriş', 'spoken-intro': 'Konuşmalı giriş', verse: 'Kıta',
    'pre-chorus': 'Ön nakarat', chorus: 'Nakarat', hook: 'Kanca',
    bridge: 'Köprü', drop: 'Drop', interlude: 'Ara',
    outro: 'Çıkış', 'spoken-outro': 'Konuşmalı çıkış',
  },
  el: {
    intro: 'Εισαγωγή', 'spoken-intro': 'Προφορική εισαγωγή', verse: 'Στροφή',
    'pre-chorus': 'Προ-ρεφρέν', chorus: 'Ρεφρέν', hook: 'Hook',
    bridge: 'Γέφυρα', drop: 'Drop', interlude: 'Ιντερλούδιο',
    outro: 'Φινάλε', 'spoken-outro': 'Προφορικό φινάλε',
  },
  hr: {
    intro: 'Intro', 'spoken-intro': 'Govorni uvod', verse: 'Strofa',
    'pre-chorus': 'Pred-refren', chorus: 'Refren', hook: 'Hook',
    bridge: 'Most', drop: 'Drop', interlude: 'Međuigra',
    outro: 'Outro', 'spoken-outro': 'Govorni završetak',
  },
  sl: {
    intro: 'Uvod', 'spoken-intro': 'Govorjeni uvod', verse: 'Kitica',
    'pre-chorus': 'Pred-refren', chorus: 'Refren', hook: 'Hook',
    bridge: 'Most', drop: 'Drop', interlude: 'Medigra',
    outro: 'Zaključek', 'spoken-outro': 'Govorjeni zaključek',
  },
  bs: {
    intro: 'Intro', 'spoken-intro': 'Govorni uvod', verse: 'Strofa',
    'pre-chorus': 'Pred-refren', chorus: 'Refren', hook: 'Hook',
    bridge: 'Most', drop: 'Drop', interlude: 'Međuigra',
    outro: 'Outro', 'spoken-outro': 'Govorni završetak',
  },
};

// Mapează aliasul EN/RO într-o cheie canonică. Acceptă variante: "Chorus",
// "Refren", "Pre Chorus", "Pre-Chorus", "Spoken Intro" etc.
const ALIAS_TO_KEY: Record<string, TagKey> = {
  intro: 'intro',
  'spoken intro': 'spoken-intro', 'spokenintro': 'spoken-intro',
  verse: 'verse', strofa: 'verse', strofă: 'verse',
  'pre chorus': 'pre-chorus', 'pre-chorus': 'pre-chorus', prechorus: 'pre-chorus',
  chorus: 'chorus', refren: 'chorus', refrain: 'chorus',
  hook: 'hook',
  bridge: 'bridge', punte: 'bridge',
  drop: 'drop',
  interlude: 'interlude', interludiu: 'interlude',
  outro: 'outro',
  'spoken outro': 'spoken-outro', 'spokenoutro': 'spoken-outro',
};

/** Returnează versurile cu marker-ele [Tag] traduse în limba dată. */
export function prettifyLyrics(text: string | null | undefined, locale: string): string {
  if (!text) return '';
  const loc = (TAG_LABELS as any)[locale] ? (locale as LyricsLocale) : 'ro';
  const labels = TAG_LABELS[loc];

  return text.replace(/\[([^\]\n]+)\]/g, (full, raw: string) => {
    const trimmed = raw.trim();
    // Detectează sufix numeric: "Verse 2", "Outro 2", "Chorus 3"
    const m = trimmed.match(/^([a-zA-ZăâîșțĂÂÎȘȚéşğüöç\- ]+?)\s*(\d+)?$/);
    if (!m) return full;
    const base = m[1].toLowerCase().replace(/\s+/g, ' ').trim();
    const num = m[2];
    const key = ALIAS_TO_KEY[base];
    if (!key) return full;
    const label = labels[key];
    return num ? `[${label} ${num}]` : `[${label}]`;
  });
}
