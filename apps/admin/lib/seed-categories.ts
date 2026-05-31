import type {
  SiteOccasionEntry,
  SiteStyleEntry,
  SiteVoiceEntry,
} from './api/sites.api';

// Listă default folosită pe site-ul public când DB nu are categorii configurate
// (vezi apps/web/lib/seed-data.ts + apps/web/components/Generator.tsx fallback).
// E duplicată aici intenționat ca admin-ul să poată pre-completa tab-ul
// „Categorii & Mostre" cu același conținut, fără să scrie nimic în DB până când
// userul editează / salvează efectiv.

// Prefixul comun pentru orice prompt Suno per-stil: păstrează identitatea de
// manea (anti-pop, anti-EDM) + Hijaz + interjecțiile cântate. Fiecare stil își
// adaugă specificul (instrument lead, ritm, tempo, mood).
const MANELE_CORE =
  "authentic Romanian MANELE (NOT pop, NOT EDM, NOT generic dance, NOT trap-rap), balkan gypsy pop with strong oriental DNA, Hijaz Phrygian-dominant oriental scale with quarter-tone slides, ornamented melismatic male lead vocal with trademark 'of/aoleu/haide' sung interjections, Romanian language";

export const SEED_STYLES: SiteStyleEntry[] = [
  {
    id: 'clasic',
    em: '🎻',
    ic: { name: 'Music2', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 },
    nm: 'Clasică de pahar',
    ds: 'Acordeon, lăutărească',
    heat: '🔥 #1',
    lyricsHint: 'manea clasică lăutărească de pahar, vocabular cu „frate / Doamne-Doamne / să trăiești", ritm mediu, drama vieții și prietenie',
    sunoPrompt: `${MANELE_CORE}, classic lăutărească tradition late-90s/early-2000s Pitești wedding-band sound, live accordion lăutărească lead with fast oriental ornamented runs, weeping lăutar violin counter-melody with glissando, cobză rhythmic strumming, darbuka derbeke + dumbek kick, finger cymbals, sweet melancholic male voice with natural cracks gentle auto-tune, mid-tempo 95-100 BPM, nostalgic-celebratory drinking-song raised-glasses energy`,
  },
  {
    id: 'modern',
    em: '🎹',
    ic: { name: 'Zap', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 },
    nm: 'Modernă',
    ds: 'Trap-manea, beat tare',
    heat: '🔥 hot',
    lyricsHint: 'manea modernă 2020s, vocabular cu „șmecher / bani / dușmani / noaptea", refren ușor de cântat, atitudine de flex',
    sunoPrompt: `${MANELE_CORE}, modern 2020s commercial manele production (Bucharest scene), oriental synth lead (Korg Pa-series taksim) over 808 sub-bass, heavy gentle auto-tune on male vocal with melismatic runs, fast hi-hat triplets supporting (not dominating), darbuka layered with modern kick, finger cymbals, polished studio mix vocal forward, mid-tempo 100-105 BPM, dramatic celebratory energy`,
  },
  {
    id: 'oriental',
    em: '🪘',
    ic: { name: 'AudioWaveform', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 },
    nm: 'Orientală',
    ds: 'Darbuka, melisme',
    lyricsHint: 'manea orientală cu plâns, vocabular cu „of / aoleu / soartă / dor", melisme lungi, ritm lent dramatic',
    sunoPrompt: `${MANELE_CORE}, heavy oriental manele with strong turkish-arabic flavor, oud and saz lead melodies, maqam Hijaz scale with quarter-tones, slow darbuka derbeke groove, melismatic crying male vocal with sobs and pitch slides, ney flute fills, soft hand percussion, mid-low tempo 85 BPM, deeply emotional melancholic mood`,
  },
  {
    id: 'trompeta',
    em: '🎺',
    ic: { name: 'Music4', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 },
    nm: 'Cu trompetă',
    ds: 'Banda de fanfare',
    lyricsHint: 'manea de nuntă cu fanfară, vocabular cu „nuntă / mireasă / petrecere", ritm vioi, atmosferă de joc',
    sunoPrompt: `${MANELE_CORE}, manele cu trompetă in balkan brass band fanfare style, blasting trumpets and trombones (Ciocărlia-energy), accordion lead trades with brass, fast dumbek kick, snare rolls, darbuka groove, melismatic male vocal over the brass, lăutar violin fills, fast 120 BPM wedding dance energy, joyful celebratory`,
  },
  {
    id: 'romantica',
    em: '💔',
    ic: { name: 'HeartCrack', fill: 'none', stroke: '#ef4444', strokeWidth: 2 },
    nm: 'De jale',
    ds: 'Pentru inimi frânte',
    lyricsHint: 'manea de jale, vocabular cu lacrimi / inimă frântă / dor / „aoleu", ritm liric lent, plâns autentic',
    sunoPrompt: `${MANELE_CORE}, manea de jale heartbreak ballad, oriental sad Hijaz scale, crying male vocal with sobs falsetto runs and natural cracks, soft accordion sustained chords, weeping violin glissando, slow darbuka pulse, deep dumbek heartbeat kick, mid-low tempo 70-80 BPM, melancholic heartbroken mood with sustained vowels on chorus`,
  },
  {
    id: 'comerciala',
    em: '💃',
    ic: { name: 'TrendingUp', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 },
    nm: 'Comercială',
    ds: 'De club, de sezon',
    lyricsHint: 'manea comercială de sezon, hook puternic în refren, vocabular accesibil, ritm de club',
    sunoPrompt: `${MANELE_CORE}, manele comerciale de club hit-radio sound, strong oriental hook on chorus, manele DNA stays dominant over the club-energy production, gentle auto-tune melismatic male vocal, oriental synth lead, darbuka groove with modern punchy kick, hand claps on offbeat, finger cymbals, polished bright mix, 105 BPM, party celebration energy`,
  },
  {
    id: 'opulenta',
    em: '👑',
    ic: { name: 'Crown', fill: '#f59e0b', stroke: '#d97706', strokeWidth: 1.5 },
    nm: 'De opulență',
    ds: 'Banii curg, lux total',
    heat: '🔥 new',
    lyricsHint: 'manea de opulență, vocabular cu „bani / lux / șmecher / boss", atitudine de flex, refren memorabil',
    sunoPrompt: `${MANELE_CORE}, manele de bani opulent luxury vibe, șmecher boss energy, big brass stabs alternating with oriental synth lead, heavy gentle auto-tune on male vocal with bragging tone, melismatic ornaments, darbuka and dumbek with deep punchy kick, fast hi-hat rolls on accents, big money flex references, polished bright mix, 100 BPM, dramatic confident mood`,
  },
  {
    id: 'iubire',
    em: '❤️',
    ic: { name: 'Heart', fill: '#ef4444', stroke: '#dc2626', strokeWidth: 1.5 },
    nm: 'De iubire',
    ds: 'Romantic pur, dulce',
    lyricsHint: 'manea de iubire dulce, vocabular cu „inima mea / sufletul meu / draga mea", ton cald și tandru',
    sunoPrompt: `${MANELE_CORE}, manea de iubire warm romantic ballad, tender ornamented male vocal with gentle melisma and soft sustained vowels, soft accordion sustained chords, violin counter-melody, light darbuka pulse, dumbek heartbeat kick, finger cymbals on accents, oriental Hijaz scale, mid-tempo 90 BPM, sweet loving emotional mood`,
  },
  {
    id: 'tallava',
    em: '🎷',
    ic: { name: 'Flame', fill: 'none', stroke: '#f97316', strokeWidth: 2 },
    nm: 'Tallava',
    ds: 'Ritm balcanic, BG/MK',
    lyricsHint: 'tallava balcanică, vocabular mixt RO-BG-MK, ritm rapid de joc, atmosferă explosive',
    sunoPrompt: `${MANELE_CORE} (with Albanian-Macedonian roma tallava fusion accents), frantic clarinet solos with virtuoso runs, rapid accordion ornaments, blasting darbuka and tapan drums double-time, melismatic male vocal switching between RO and balkan interjections, oriental Hijaz scale, fast 130 BPM frantic dance energy, joyful frenetic mood`,
  },
  {
    id: 'kuchek',
    em: '🥁',
    ic: { name: 'Disc3', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 },
    nm: 'Kuchek',
    ds: 'Ritm rom bulgăresc',
    lyricsHint: 'kuchek bulgăresc rom, ritm 9/8 odd-meter, atmosferă de petrecere stradală, vocabular festiv',
    sunoPrompt: `${MANELE_CORE} (with Bulgarian Roma kuchek influence), 9/8 odd-meter dance groove, blasting balkan brass band (trumpets and trombones), darbuka and tapan drums double-time, accordion ornaments, fanfare energy, melismatic male vocal, oriental Hijaz scale, fast 130 BPM kuchek dance, street-party celebration mood`,
  },
  {
    id: 'trapanele',
    em: '🎧',
    ic: { name: 'Headphones', fill: 'none', stroke: '#8b5cf6', strokeWidth: 2 },
    nm: 'Trapanele',
    ds: 'Trap × manea, hard',
    lyricsHint: 'trapanele dark, vocabular cu „noaptea / strada / dușmani", versuri cântate (NU rapate), atitudine hard',
    sunoPrompt: `${MANELE_CORE}, romanian trap-manele where manele DNA dominates the trap beat, oriental Hijaz synth lead carries the melody up-front, darbuka layered over deep trap 808 sub-bass, melismatic SUNG male vocal with heavy auto-tune (NOT rap, NOT spoken), hi-hat triplets stay subtle so accordion and oriental synth remain front, finger cymbals on accents, 130-140 BPM, dark hard nighttime mood`,
  },
  {
    id: 'pahar',
    em: '🍷',
    ic: { name: 'Wine', fill: 'none', stroke: '#ef4444', strokeWidth: 2 },
    nm: 'De pahar',
    ds: 'Petrecere, voie bună',
    lyricsHint: 'manea de pahar la petrecere, vocabular cu „pahar / haide / fraților / să trăiești", refren cu strigăte',
    sunoPrompt: `${MANELE_CORE}, manea de pahar festive drinking song with live wedding-band feel, accordion and lăutar violin trade solos, cobză rhythm, darbuka derbeke + dumbek kick, finger cymbals, hand claps on offbeat, optional glasses-clinking foley, celebratory shouted male background vocals, melismatic lead male voice with raised-glass energy, mid-tempo 100 BPM, joyful party mood`,
  },
];

export const SEED_VOICES: SiteVoiceEntry[] = [
  { id: 'male', nm: 'Bărbătească', tg: 'Voce de bărbat', av: '♂', gender: 'm', ic: { name: 'Mic', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'female', nm: 'Feminină', tg: 'Voce de femeie', av: '♀', gender: 'f', ic: { name: 'Flower2', fill: '#ec4899', stroke: '#db2777', strokeWidth: 1.5 } },
];

export const SEED_OCCASIONS: SiteOccasionEntry[] = [
  { id: 'zi', em: '🎂', nm: 'Zi naștere', ic: { name: 'Cake', fill: 'none', stroke: '#ec4899', strokeWidth: 2 } },
  { id: 'nunta', em: '💒', nm: 'Nuntă', ic: { name: 'Gem', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'botez', em: '👶', nm: 'Botez', ic: { name: 'Baby', fill: 'none', stroke: '#3b82f6', strokeWidth: 2 } },
  { id: 'cumatrie', em: '🍷', nm: 'Cumătrie', ic: { name: 'Wine', fill: 'none', stroke: '#ef4444', strokeWidth: 2 } },
  { id: 'cuplu', em: '❤️', nm: 'Aniv. cuplu', ic: { name: 'Heart', fill: '#ef4444', stroke: '#dc2626', strokeWidth: 1.5 } },
  { id: 'sef', em: '💼', nm: 'Pentru șef', ic: { name: 'Briefcase', fill: 'none', stroke: '#6b7280', strokeWidth: 2 } },
  { id: 'dragoste', em: '😍', nm: 'Declarație', ic: { name: 'Sparkles', fill: 'none', stroke: '#ec4899', strokeWidth: 2 } },
  { id: 'roast', em: '🤡', nm: 'Roast prieten', ic: { name: 'Laugh', fill: 'none', stroke: '#f97316', strokeWidth: 2 } },
  { id: 'nas', em: '🤝', nm: 'Naș / fin', ic: { name: 'Handshake', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'inmorm', em: '🕯️', nm: 'Înmormântare', ic: { name: 'Feather', fill: 'none', stroke: '#6b7280', strokeWidth: 2 } },
  { id: 'motiv', em: '💪', nm: 'Motivațională', ic: { name: 'Zap', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'altul', em: '✨', nm: 'Altă ocazie', ic: { name: 'Star', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 } },
];
