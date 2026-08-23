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
//
// Prompturile Suno/Google de aici trebuie ținute în sync cu
// apps/api/src/modules/sites/catalog-seed.ts — ăla e seed-ul care umple golurile
// pe site-urile de producție din admin /rollout.

// Prefixul comun pentru orice prompt Suno per-stil: păstrează identitatea de
// manea (anti-pop, anti-EDM) + Hijaz + interjecțiile cântate. Fiecare stil își
// adaugă specificul (instrument lead, ritm, tempo, mood).
const MANELE_CORE =
  "authentic Romanian MANELE (NOT pop, NOT EDM, NOT generic dance, NOT trap-rap), balkan gypsy pop with strong oriental DNA, Hijaz Phrygian-dominant oriental scale with quarter-tone slides, ornamented melismatic male lead vocal with trademark 'of/aoleu/haide' sung interjections, Romanian language";

/** Prompt natural-language pentru Lyria 3 Pro — diferit de tag-urile CSV ale Suno. */
const GOOGLE_CORE =
  'Create a full-length authentic Romanian manele song (not pop, not EDM, not trap-rap, not generic dance). Balkan gypsy-pop with oriental Hijaz scale, darbuka, accordion, violin, and ornamented Romanian vocals with sung interjections (of, aoleu, haide). Language: Romanian. Follow the provided lyrics exactly, keeping verse/chorus structure.';

function gLyria(detail: string): string {
  return `${GOOGLE_CORE} ${detail}`;
}

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
    googlePrompt: gLyria('Classic late-90s/early-2000s Pitești wedding-band manele. Live accordion lead with fast oriental runs, weeping violin glissando, cobză strumming, darbuka and dumbek kick, finger cymbals. Mid-tempo 95-100 BPM, nostalgic drinking-song energy with raised glasses.'),
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
    googlePrompt: gLyria('Modern 2020s Bucharest commercial manele. Oriental synth taksim over 808 sub-bass, polished vocal-forward mix, darbuka layered with a modern kick, finger cymbals. 100-105 BPM, dramatic celebratory energy.'),
  },
  {
    id: 'oriental',
    em: '🪘',
    ic: { name: 'AudioWaveform', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 },
    nm: 'Orientală',
    ds: 'Darbuka, melisme',
    lyricsHint: 'manea orientală cu plâns, vocabular cu „of / aoleu / soartă / dor", melisme lungi, ritm lent dramatic',
    sunoPrompt: `${MANELE_CORE}, heavy oriental manele with strong turkish-arabic flavor, oud and saz lead melodies, maqam Hijaz scale with quarter-tones, slow darbuka derbeke groove, melismatic crying male vocal with sobs and pitch slides, ney flute fills, soft hand percussion, mid-low tempo 85 BPM, deeply emotional melancholic mood`,
    googlePrompt: gLyria('Heavy oriental manele with Turkish-Arabic flavour. Oud and saz leads, Hijaz quarter-tones, slow darbuka groove, crying melismatic vocal with pitch slides, ney flute fills. About 85 BPM, deeply melancholic.'),
  },
  {
    id: 'trompeta',
    em: '🎺',
    ic: { name: 'Music4', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 },
    nm: 'Cu trompetă',
    ds: 'Banda de fanfare',
    lyricsHint: 'manea de nuntă cu fanfară, vocabular cu „nuntă / mireasă / petrecere", ritm vioi, atmosferă de joc',
    sunoPrompt: `${MANELE_CORE}, manele cu trompetă in balkan brass band fanfare style, blasting trumpets and trombones (Ciocărlia-energy), accordion lead trades with brass, fast dumbek kick, snare rolls, darbuka groove, melismatic male vocal over the brass, lăutar violin fills, fast 120 BPM wedding dance energy, joyful celebratory`,
    googlePrompt: gLyria('Manele with Balkan brass fanfare. Blasting trumpets and trombones trading with accordion, fast dumbek kick, snare rolls, darbuka. About 120 BPM, joyful wedding-dance energy.'),
  },
  {
    id: 'romantica',
    em: '💔',
    ic: { name: 'HeartCrack', fill: 'none', stroke: '#ef4444', strokeWidth: 2 },
    nm: 'De jale',
    ds: 'Pentru inimi frânte',
    lyricsHint: 'manea de jale, vocabular cu lacrimi / inimă frântă / dor / „aoleu", ritm liric lent, plâns autentic',
    sunoPrompt: `${MANELE_CORE}, manea de jale heartbreak ballad, oriental sad Hijaz scale, crying male vocal with sobs falsetto runs and natural cracks, soft accordion sustained chords, weeping violin glissando, slow darbuka pulse, deep dumbek heartbeat kick, mid-low tempo 70-80 BPM, melancholic heartbroken mood with sustained vowels on chorus`,
    googlePrompt: gLyria('Heartbreak manea de jale. Slow 70-80 BPM ballad, crying vocal with sobs and falsetto, soft accordion chords, weeping violin glissando, heartbeat dumbek kick. Melancholic, sustained vowels on the chorus.'),
  },
  {
    id: 'comerciala',
    em: '💃',
    ic: { name: 'TrendingUp', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 },
    nm: 'Comercială',
    ds: 'De club, de sezon',
    lyricsHint: 'manea comercială de sezon, hook puternic în refren, vocabular accesibil, ritm de club',
    sunoPrompt: `${MANELE_CORE}, manele comerciale de club hit-radio sound, strong oriental hook on chorus, manele DNA stays dominant over the club-energy production, gentle auto-tune melismatic male vocal, oriental synth lead, darbuka groove with modern punchy kick, hand claps on offbeat, finger cymbals, polished bright mix, 105 BPM, party celebration energy`,
    googlePrompt: gLyria('Commercial club manele, hit-radio sound. Strong oriental hook on the chorus, punchy modern kick under darbuka, offbeat claps, finger cymbals. 105 BPM, party energy, bright mix, manele DNA still dominant.'),
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
    googlePrompt: gLyria('Opulent manele de bani, șmecher boss energy. Big brass stabs alternating with oriental synth, confident bragging vocal, punchy kick, hi-hat rolls. 100 BPM, dramatic and luxurious.'),
  },
  {
    id: 'iubire',
    em: '❤️',
    ic: { name: 'Heart', fill: '#ef4444', stroke: '#dc2626', strokeWidth: 1.5 },
    nm: 'De iubire',
    ds: 'Romantic pur, dulce',
    lyricsHint: 'manea de iubire dulce, vocabular cu „inima mea / sufletul meu / draga mea", ton cald și tandru',
    sunoPrompt: `${MANELE_CORE}, manea de iubire warm romantic ballad, tender ornamented male vocal with gentle melisma and soft sustained vowels, soft accordion sustained chords, violin counter-melody, light darbuka pulse, dumbek heartbeat kick, finger cymbals on accents, oriental Hijaz scale, mid-tempo 90 BPM, sweet loving emotional mood`,
    googlePrompt: gLyria('Warm romantic manea de iubire. Tender ornamented vocal, soft accordion chords, violin counter-melody, light darbuka pulse. About 90 BPM, sweet and loving.'),
  },
  {
    id: 'tallava',
    em: '🎷',
    ic: { name: 'Flame', fill: 'none', stroke: '#f97316', strokeWidth: 2 },
    nm: 'Tallava',
    ds: 'Ritm balcanic, BG/MK',
    lyricsHint: 'tallava balcanică, vocabular mixt RO-BG-MK, ritm rapid de joc, atmosferă explosive',
    sunoPrompt: `${MANELE_CORE} (with Albanian-Macedonian roma tallava fusion accents), frantic clarinet solos with virtuoso runs, rapid accordion ornaments, blasting darbuka and tapan drums double-time, melismatic male vocal switching between RO and balkan interjections, oriental Hijaz scale, fast 130 BPM frantic dance energy, joyful frenetic mood`,
    googlePrompt: gLyria('Tallava fusion (Albanian-Macedonian Roma accents). Frantic clarinet solos, rapid accordion ornaments, blasting darbuka and tapan double-time. About 130 BPM, joyful frenetic dance energy.'),
  },
  {
    id: 'kuchek',
    em: '🥁',
    ic: { name: 'Disc3', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 },
    nm: 'Kuchek',
    ds: 'Ritm rom bulgăresc',
    lyricsHint: 'kuchek bulgăresc rom, ritm 9/8 odd-meter, atmosferă de petrecere stradală, vocabular festiv',
    sunoPrompt: `${MANELE_CORE} (with Bulgarian Roma kuchek influence), 9/8 odd-meter dance groove, blasting balkan brass band (trumpets and trombones), darbuka and tapan drums double-time, accordion ornaments, fanfare energy, melismatic male vocal, oriental Hijaz scale, fast 130 BPM kuchek dance, street-party celebration mood`,
    googlePrompt: gLyria('Bulgarian Roma kuchek influence. Odd-meter 9/8 dance groove, blasting Balkan brass, darbuka and tapan double-time. About 130 BPM, street-party celebration.'),
  },
  {
    id: 'trapanele',
    em: '🎧',
    ic: { name: 'Headphones', fill: 'none', stroke: '#8b5cf6', strokeWidth: 2 },
    nm: 'Trapanele',
    ds: 'Trap × manea, hard',
    lyricsHint: 'trapanele dark, vocabular cu „noaptea / strada / dușmani", versuri cântate (NU rapate), atitudine hard',
    sunoPrompt: `${MANELE_CORE}, romanian trap-manele where manele DNA dominates the trap beat, oriental Hijaz synth lead carries the melody up-front, darbuka layered over deep trap 808 sub-bass, melismatic SUNG male vocal with heavy auto-tune (NOT rap, NOT spoken), hi-hat triplets stay subtle so accordion and oriental synth remain front, finger cymbals on accents, 130-140 BPM, dark hard nighttime mood`,
    googlePrompt: gLyria('Trap-manele where manele DNA dominates. Oriental Hijaz synth melody in front, darbuka over 808 sub-bass, SUNG (not rapped) auto-tuned vocal. 130-140 BPM, dark nighttime mood.'),
  },
  {
    id: 'pahar',
    em: '🍷',
    ic: { name: 'Wine', fill: 'none', stroke: '#ef4444', strokeWidth: 2 },
    nm: 'De pahar',
    ds: 'Petrecere, voie bună',
    lyricsHint: 'manea de pahar la petrecere, vocabular cu „pahar / haide / fraților / să trăiești", refren cu strigăte',
    sunoPrompt: `${MANELE_CORE}, manea de pahar festive drinking song with live wedding-band feel, accordion and lăutar violin trade solos, cobză rhythm, darbuka derbeke + dumbek kick, finger cymbals, hand claps on offbeat, optional glasses-clinking foley, celebratory shouted male background vocals, melismatic lead male voice with raised-glass energy, mid-tempo 100 BPM, joyful party mood`,
    googlePrompt: gLyria('Festive manea de pahar, live wedding-band feel. Accordion and violin trade solos, cobză rhythm, darbuka, offbeat claps, glasses clinking, shouted background vocals. About 100 BPM, joyful party mood.'),
  },
];

export const SEED_VOICES: SiteVoiceEntry[] = [
  { id: 'male', nm: 'Bărbătească', tg: 'Voce de bărbat', av: '♂', gender: 'm', ic: { name: 'Mic', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'female', nm: 'Feminină', tg: 'Voce de femeie', av: '♀', gender: 'f', ic: { name: 'Flower2', fill: '#ec4899', stroke: '#db2777', strokeWidth: 1.5 } },
];

export const SEED_OCCASIONS: SiteOccasionEntry[] = [
  { id: 'zi', em: '🎂', nm: 'Zi naștere', ic: { name: 'Cake', fill: 'none', stroke: '#ec4899', strokeWidth: 2 }, sunoPrompt: 'birthday celebration, la mulți ani, festive family gathering', googlePrompt: 'Birthday celebration for the named person. Festive la mulți ani energy, family gathering, raised glasses, warm and joyful.' },
  { id: 'nunta', em: '💒', nm: 'Nuntă', ic: { name: 'Gem', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 }, sunoPrompt: 'wedding celebration, mire și mireasă, hora de nuntă', googlePrompt: 'Wedding celebration. Mire and mireasă, hora energy, blessing the couple, big family party, joyful and ceremonial.' },
  { id: 'botez', em: '👶', nm: 'Botez', ic: { name: 'Baby', fill: 'none', stroke: '#3b82f6', strokeWidth: 2 }, sunoPrompt: 'christening, baby blessing, family godparents', googlePrompt: 'Christening / botez. Bless the child, godparents (nași), family gathering, tender and festive at once.' },
  { id: 'cumatrie', em: '🍷', nm: 'Cumătrie', ic: { name: 'Wine', fill: 'none', stroke: '#ef4444', strokeWidth: 2 }, sunoPrompt: 'godparent feast, cumătrie, raised glasses', googlePrompt: 'Cumătrie feast. Godparents and family at the table, raised glasses, warm kinship, celebratory manele.' },
  { id: 'cuplu', em: '❤️', nm: 'Aniv. cuplu', ic: { name: 'Heart', fill: '#ef4444', stroke: '#dc2626', strokeWidth: 1.5 }, sunoPrompt: 'couple anniversary, love years together', googlePrompt: 'Couple anniversary. Years together, devoted love, romantic but still a manea — warm, not pop ballad.' },
  { id: 'sef', em: '💼', nm: 'Pentru șef', ic: { name: 'Briefcase', fill: 'none', stroke: '#6b7280', strokeWidth: 2 }, sunoPrompt: 'boss respect, șef, respect at work', googlePrompt: 'Dedication for the boss (șef). Respect, loyalty, a bit of șmecher swagger, workplace family energy.' },
  { id: 'dragoste', em: '😍', nm: 'Declarație', ic: { name: 'Sparkles', fill: 'none', stroke: '#ec4899', strokeWidth: 2 }, sunoPrompt: 'love declaration, inima mea, romantic confession', googlePrompt: 'Love declaration. Direct confession to the named person, inima mea, devoted and emotional, still a manea.' },
  { id: 'roast', em: '🤡', nm: 'Roast prieten', ic: { name: 'Laugh', fill: 'none', stroke: '#f97316', strokeWidth: 2 }, sunoPrompt: 'friendly roast, teasing a friend, playful insults', googlePrompt: 'Friendly roast of a pal. Playful teasing, not mean, party laughter, still sung as a manea not comedy rap.' },
  { id: 'nas', em: '🤝', nm: 'Naș / fin', ic: { name: 'Handshake', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 }, sunoPrompt: 'godfather / godson, naș și fin, family bond', googlePrompt: 'For naș or fin. Family bond, respect, wedding-family energy, loyalty between godfather and godson.' },
  { id: 'inmorm', em: '🕯️', nm: 'Înmormântare', ic: { name: 'Feather', fill: 'none', stroke: '#6b7280', strokeWidth: 2 }, sunoPrompt: 'memorial, slow jale, remembrance', googlePrompt: 'Memorial / înmormântare. Slow, respectful manea de jale, remembrance of the named person, no party energy.' },
  { id: 'motiv', em: '💪', nm: 'Motivațională', ic: { name: 'Zap', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 }, sunoPrompt: 'motivational, get up, fight, never give up', googlePrompt: 'Motivational manea. Get up, fight, never give up, proud and driving — still sung manele, not rap anthem.' },
  { id: 'altul', em: '✨', nm: 'Altă ocazie', ic: { name: 'Star', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 }, sunoPrompt: 'personal dedication, general celebration', googlePrompt: 'Personal dedication and general celebration for the named person, flexible festive manele energy.' },
];
