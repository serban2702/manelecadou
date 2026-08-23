/**
 * Prompturi canonice per stil / ocazie (Suno tag-uri vs Lyria limbaj natural).
 * Folosite de SiteRolloutService ca să umple câmpurile GOALE pe site-urile
 * existente — nu suprascrie textul deja salvat de operator.
 *
 * ATENȚIE — FIECARE SEED ARE O LIMBĂ. Seed-ul RO e scris pentru piața
 * românească: stilurile cer explicit „Romanian language / authentic Romanian
 * MANELE”, iar ocaziile conțin română curată („mire și mireasă”, „la mulți ani”).
 * `sunoPrompt`-ul ocaziei intră DIRECT în style string-ul trimis la Suno
 * (suno.real.provider → occasionStyleHint), deci aplicat pe un site grec sau
 * bulgăresc ar cânta manele românești pe chalgapodarok.bg. De aceea seed-urile
 * sunt indexate pe locale în CATALOG_SEEDS și rollout-ul le potrivește pe
 * `site.locale` — nu se aplică niciodată „la toate site-urile”.
 *
 * Azi avem trei seed-uri, fiecare cu genul și limba pieței lui:
 *   ro → manele românești          (MANELE_CORE / GOOGLE_CORE)
 *   bg → chalga / pop-folk bulgar  (CHALGA_CORE / CHALGA_GOOGLE_CORE)
 *   el → laïko / skiladiko grecesc (LAIKO_CORE / LAIKO_GOOGLE_CORE)
 * În seed-urile bg/el NU apare niciodată „Romanian” sau „manele” — genul greșit
 * în style string e la fel de rău ca limba greșită.
 *
 * NOTĂ despre id-uri: site-ul bulgăresc are id-uri de OCAZII moștenite din RO
 * („nunta”, „botez”, „sef”…) pentru că a fost clonat din catalogul românesc.
 * Id-ul e doar o cheie — conținutul din seed-ul `bg` e bulgăresc. Nu redenumi
 * id-urile aici fără să le redenumești și în `sites.occasions` din DB, altfel
 * potrivirea cade și site-ul rămâne iar fără prompturi.
 *
 * Dacă adaugi un stil/ocazie nouă în apps/admin/lib/seed-categories.ts,
 * copiază id + sunoPrompt + googlePrompt și aici, apoi adaugă un check
 * în site-rollout.service.ts dacă e un tip nou de gap (nu doar prompturi).
 *
 * Dacă vrei seed pentru o piață nouă (el, bg, …): scrie prompturile în limba
 * ei, cu id-urile ei de stiluri/ocazii, și adaugă o intrare în CATALOG_SEEDS.
 * Rollout-ul o preia automat, fără alte modificări.
 */

export interface CatalogPromptSeed {
  sunoPrompt: string;
  googlePrompt: string;
}

/** Map id → prompturi, pentru stiluri sau pentru ocazii. */
export type CatalogPromptSeedMap = Record<string, CatalogPromptSeed>;

/** Setul complet de prompturi al unei limbi. */
export interface CatalogPromptSeedSet {
  /** Limba în care e scris textul (se potrivește cu site.locale). */
  locale: string;
  styles: CatalogPromptSeedMap;
  occasions: CatalogPromptSeedMap;
}

const MANELE_CORE =
  "authentic Romanian MANELE (NOT pop, NOT EDM, NOT generic dance, NOT trap-rap), balkan gypsy pop with strong oriental DNA, Hijaz Phrygian-dominant oriental scale with quarter-tone slides, ornamented melismatic male lead vocal with trademark 'of/aoleu/haide' sung interjections, Romanian language";

const GOOGLE_CORE =
  'Create a full-length authentic Romanian manele song (not pop, not EDM, not trap-rap, not generic dance). Balkan gypsy-pop with oriental Hijaz scale, darbuka, accordion, violin, and ornamented Romanian vocals with sung interjections (of, aoleu, haide). Language: Romanian. Follow the provided lyrics exactly, keeping verse/chorus structure.';

function g(detail: string): string {
  return `${GOOGLE_CORE} ${detail}`;
}

/** Stiluri — text RO (vezi antetul fișierului: NU se aplică pe alte limbi). */
export const STYLE_PROMPT_SEED: CatalogPromptSeedMap = {
  clasic: {
    sunoPrompt: `${MANELE_CORE}, classic lăutărească tradition late-90s/early-2000s Pitești wedding-band sound, live accordion lăutărească lead with fast oriental ornamented runs, weeping lăutar violin counter-melody with glissando, cobză rhythmic strumming, darbuka derbeke + dumbek kick, finger cymbals, sweet melancholic male voice with natural cracks gentle auto-tune, mid-tempo 95-100 BPM, nostalgic-celebratory drinking-song raised-glasses energy`,
    googlePrompt: g('Classic late-90s/early-2000s Pitești wedding-band manele. Live accordion lead with fast oriental runs, weeping violin glissando, cobză strumming, darbuka and dumbek kick, finger cymbals. Mid-tempo 95-100 BPM, nostalgic drinking-song energy with raised glasses.'),
  },
  modern: {
    sunoPrompt: `${MANELE_CORE}, modern 2020s commercial manele production (Bucharest scene), oriental synth lead (Korg Pa-series taksim) over 808 sub-bass, heavy gentle auto-tune on male vocal with melismatic runs, fast hi-hat triplets supporting (not dominating), darbuka layered with modern kick, finger cymbals, polished studio mix vocal forward, mid-tempo 100-105 BPM, dramatic celebratory energy`,
    googlePrompt: g('Modern 2020s Bucharest commercial manele. Oriental synth taksim over 808 sub-bass, polished vocal-forward mix, darbuka layered with a modern kick, finger cymbals. 100-105 BPM, dramatic celebratory energy.'),
  },
  oriental: {
    sunoPrompt: `${MANELE_CORE}, heavy oriental manele with strong turkish-arabic flavor, oud and saz lead melodies, maqam Hijaz scale with quarter-tones, slow darbuka derbeke groove, melismatic crying male vocal with sobs and pitch slides, ney flute fills, soft hand percussion, mid-low tempo 85 BPM, deeply emotional melancholic mood`,
    googlePrompt: g('Heavy oriental manele with Turkish-Arabic flavour. Oud and saz leads, Hijaz quarter-tones, slow darbuka groove, crying melismatic vocal with pitch slides, ney flute fills. About 85 BPM, deeply melancholic.'),
  },
  trompeta: {
    sunoPrompt: `${MANELE_CORE}, manele cu trompetă in balkan brass band fanfare style, blasting trumpets and trombones (Ciocărlia-energy), accordion lead trades with brass, fast dumbek kick, snare rolls, darbuka groove, melismatic male vocal over the brass, lăutar violin fills, fast 120 BPM wedding dance energy, joyful celebratory`,
    googlePrompt: g('Manele with Balkan brass fanfare. Blasting trumpets and trombones trading with accordion, fast dumbek kick, snare rolls, darbuka. About 120 BPM, joyful wedding-dance energy.'),
  },
  romantica: {
    sunoPrompt: `${MANELE_CORE}, manea de jale heartbreak ballad, oriental sad Hijaz scale, crying male vocal with sobs falsetto runs and natural cracks, soft accordion sustained chords, weeping violin glissando, slow darbuka pulse, deep dumbek heartbeat kick, mid-low tempo 70-80 BPM, melancholic heartbroken mood with sustained vowels on chorus`,
    googlePrompt: g('Heartbreak manea de jale. Slow 70-80 BPM ballad, crying vocal with sobs and falsetto, soft accordion chords, weeping violin glissando, heartbeat dumbek kick. Melancholic, sustained vowels on the chorus.'),
  },
  comerciala: {
    sunoPrompt: `${MANELE_CORE}, manele comerciale de club hit-radio sound, strong oriental hook on chorus, manele DNA stays dominant over the club-energy production, gentle auto-tune melismatic male vocal, oriental synth lead, darbuka groove with modern punchy kick, hand claps on offbeat, finger cymbals, polished bright mix, 105 BPM, party celebration energy`,
    googlePrompt: g('Commercial club manele, hit-radio sound. Strong oriental hook on the chorus, punchy modern kick under darbuka, offbeat claps, finger cymbals. 105 BPM, party energy, bright mix, manele DNA still dominant.'),
  },
  opulenta: {
    sunoPrompt: `${MANELE_CORE}, manele de bani opulent luxury vibe, șmecher boss energy, big brass stabs alternating with oriental synth lead, heavy gentle auto-tune on male vocal with bragging tone, melismatic ornaments, darbuka and dumbek with deep punchy kick, fast hi-hat rolls on accents, big money flex references, polished bright mix, 100 BPM, dramatic confident mood`,
    googlePrompt: g('Opulent manele de bani, șmecher boss energy. Big brass stabs alternating with oriental synth, confident bragging vocal, punchy kick, hi-hat rolls. 100 BPM, dramatic and luxurious.'),
  },
  iubire: {
    sunoPrompt: `${MANELE_CORE}, manea de iubire warm romantic ballad, tender ornamented male vocal with gentle melisma and soft sustained vowels, soft accordion sustained chords, violin counter-melody, light darbuka pulse, dumbek heartbeat kick, finger cymbals on accents, oriental Hijaz scale, mid-tempo 90 BPM, sweet loving emotional mood`,
    googlePrompt: g('Warm romantic manea de iubire. Tender ornamented vocal, soft accordion chords, violin counter-melody, light darbuka pulse. About 90 BPM, sweet and loving.'),
  },
  tallava: {
    sunoPrompt: `${MANELE_CORE} (with Albanian-Macedonian roma tallava fusion accents), frantic clarinet solos with virtuoso runs, rapid accordion ornaments, blasting darbuka and tapan drums double-time, melismatic male vocal switching between RO and balkan interjections, oriental Hijaz scale, fast 130 BPM frantic dance energy, joyful frenetic mood`,
    googlePrompt: g('Tallava fusion (Albanian-Macedonian Roma accents). Frantic clarinet solos, rapid accordion ornaments, blasting darbuka and tapan double-time. About 130 BPM, joyful frenetic dance energy.'),
  },
  kuchek: {
    sunoPrompt: `${MANELE_CORE} (with Bulgarian Roma kuchek influence), 9/8 odd-meter dance groove, blasting balkan brass band (trumpets and trombones), darbuka and tapan drums double-time, accordion ornaments, fanfare energy, melismatic male vocal, oriental Hijaz scale, fast 130 BPM kuchek dance, street-party celebration mood`,
    googlePrompt: g('Bulgarian Roma kuchek influence. Odd-meter 9/8 dance groove, blasting Balkan brass, darbuka and tapan double-time. About 130 BPM, street-party celebration.'),
  },
  trapanele: {
    sunoPrompt: `${MANELE_CORE}, romanian trap-manele where manele DNA dominates the trap beat, oriental Hijaz synth lead carries the melody up-front, darbuka layered over deep trap 808 sub-bass, melismatic SUNG male vocal with heavy auto-tune (NOT rap, NOT spoken), hi-hat triplets stay subtle so accordion and oriental synth remain front, finger cymbals on accents, 130-140 BPM, dark hard nighttime mood`,
    googlePrompt: g('Trap-manele where manele DNA dominates. Oriental Hijaz synth melody in front, darbuka over 808 sub-bass, SUNG (not rapped) auto-tuned vocal. 130-140 BPM, dark nighttime mood.'),
  },
  pahar: {
    sunoPrompt: `${MANELE_CORE}, manea de pahar festive drinking song with live wedding-band feel, accordion and lăutar violin trade solos, cobză rhythm, darbuka derbeke + dumbek kick, finger cymbals, hand claps on offbeat, optional glasses-clinking foley, celebratory shouted male background vocals, melismatic lead male voice with raised-glass energy, mid-tempo 100 BPM, joyful party mood`,
    googlePrompt: g('Festive manea de pahar, live wedding-band feel. Accordion and violin trade solos, cobză rhythm, darbuka, offbeat claps, glasses clinking, shouted background vocals. About 100 BPM, joyful party mood.'),
  },
};

/** Ocazii — text RO (vezi antetul fișierului: NU se aplică pe alte limbi). */
export const OCCASION_PROMPT_SEED: CatalogPromptSeedMap = {
  zi: {
    sunoPrompt: 'birthday celebration, la mulți ani, festive family gathering',
    googlePrompt: 'Birthday celebration for the named person. Festive la mulți ani energy, family gathering, raised glasses, warm and joyful.',
  },
  nunta: {
    sunoPrompt: 'wedding celebration, mire și mireasă, hora de nuntă',
    googlePrompt: 'Wedding celebration. Mire and mireasă, hora energy, blessing the couple, big family party, joyful and ceremonial.',
  },
  botez: {
    sunoPrompt: 'christening, baby blessing, family godparents',
    googlePrompt: 'Christening / botez. Bless the child, godparents (nași), family gathering, tender and festive at once.',
  },
  cumatrie: {
    sunoPrompt: 'godparent feast, cumătrie, raised glasses',
    googlePrompt: 'Cumătrie feast. Godparents and family at the table, raised glasses, warm kinship, celebratory manele.',
  },
  cuplu: {
    sunoPrompt: 'couple anniversary, love years together',
    googlePrompt: 'Couple anniversary. Years together, devoted love, romantic but still a manea — warm, not pop ballad.',
  },
  sef: {
    sunoPrompt: 'boss respect, șef, respect at work',
    googlePrompt: 'Dedication for the boss (șef). Respect, loyalty, a bit of șmecher swagger, workplace family energy.',
  },
  dragoste: {
    sunoPrompt: 'love declaration, inima mea, romantic confession',
    googlePrompt: 'Love declaration. Direct confession to the named person, inima mea, devoted and emotional, still a manea.',
  },
  roast: {
    sunoPrompt: 'friendly roast, teasing a friend, playful insults',
    googlePrompt: 'Friendly roast of a pal. Playful teasing, not mean, party laughter, still sung as a manea not comedy rap.',
  },
  nas: {
    sunoPrompt: 'godfather / godson, naș și fin, family bond',
    googlePrompt: 'For naș or fin. Family bond, respect, wedding-family energy, loyalty between godfather and godson.',
  },
  inmorm: {
    sunoPrompt: 'memorial, slow jale, remembrance',
    googlePrompt: 'Memorial / înmormântare. Slow, respectful manea de jale, remembrance of the named person, no party energy.',
  },
  motiv: {
    sunoPrompt: 'motivational, get up, fight, never give up',
    googlePrompt: 'Motivational manea. Get up, fight, never give up, proud and driving — still sung manele, not rap anthem.',
  },
  altul: {
    sunoPrompt: 'personal dedication, general celebration',
    googlePrompt: 'Personal dedication and general celebration for the named person, flexible festive manele energy.',
  },
};

/* ========================================================================== *
 *  BG — chalgapodarok.bg. Gen: chalga / pop-folk bulgăresc. Versuri: bulgară. *
 * ========================================================================== */

const CHALGA_CORE =
  "authentic Bulgarian CHALGA / pop-folk (NOT pop, NOT EDM, NOT generic dance, NOT trap-rap, NOT turbo-folk parody), Balkan pop-folk with strong oriental DNA, Hijaz Phrygian-dominant oriental scale with quarter-tone slides, ornamented melismatic lead vocal with trademark Balkan sung interjections ('ay', 'more', 'opa'), tarabuka and tapan percussion, Bulgarian language";

const CHALGA_GOOGLE_CORE =
  'Create a full-length authentic Bulgarian chalga / pop-folk song (not pop, not EDM, not trap-rap, not generic dance). Balkan pop-folk with the oriental Hijaz scale, tarabuka, tapan, accordion, clarinet and oriental synth, with ornamented Bulgarian vocals and sung Balkan interjections (ay, more, opa). Language: Bulgarian. Follow the provided lyrics exactly, keeping verse/chorus structure.';

function gBg(detail: string): string {
  return `${CHALGA_GOOGLE_CORE} ${detail}`;
}

/** Stiluri — text BG (vezi antetul fișierului: NU se aplică pe alte limbi). */
export const STYLE_PROMPT_SEED_BG: CatalogPromptSeedMap = {
  popfolk: {
    sunoPrompt: `${CHALGA_CORE}, modern 2020s commercial chalga (Payner / Planeta TV sound), oriental synth lead (Korg Pa-series oriental taksim) over deep punchy kick and sub-bass, tarabuka layered with modern club drums, kanun accents, gentle auto-tune on the melismatic vocal with fast ornamented runs, bright polished vocal-forward studio mix, mid-tempo 102-108 BPM, glossy confident party energy`,
    googlePrompt: gBg('Modern 2020s commercial chalga, Payner / Planeta TV sound. Oriental synth taksim over a punchy kick and sub-bass, tarabuka with modern club drums, kanun accents, gentle auto-tune, bright vocal-forward mix. 102-108 BPM, glossy confident party energy.'),
  },
  klasicheska: {
    sunoPrompt: `${CHALGA_CORE}, classic 1990s-2000s chalga sound, live accordion lead with fast oriental ornamented runs, clarinet counter-melody, warm analog synth strings and pads of the era, tarabuka and tapan groove, walking electric bass under the chorus, slightly nasal ornamented vocal with natural cracks and little auto-tune, mid-tempo 95-100 BPM, nostalgic smoky kafene celebration mood`,
    googlePrompt: gBg('Classic 1990s-2000s chalga. Live accordion lead with fast oriental runs, clarinet counter-melody, warm analog synth pads, tarabuka and tapan groove, walking bass, slightly nasal vocal with natural cracks. 95-100 BPM, nostalgic kafene mood.'),
  },
  kyuchek: {
    sunoPrompt: `${CHALGA_CORE}, fast Balkan Roma kyuchek, 9/8 odd-meter dance groove, blasting clarinet and saxophone solos with virtuoso runs, brass stabs answering, tarabuka and tapan double-time with heavy hand claps, rapid accordion ornaments, short shouted vocal hooks between instrumental breaks, Hijaz scale with quarter-tones, fast 128-135 BPM, sweaty frenetic street-party dance energy`,
    googlePrompt: gBg('Fast Balkan Roma kyuchek in 9/8 odd meter. Blasting clarinet and saxophone solos, brass stabs, tarabuka and tapan double-time, heavy claps, short shouted vocal hooks. 128-135 BPM, sweaty street-party dance energy.'),
  },
  talava: {
    sunoPrompt: `${CHALGA_CORE} with Albanian-Roma tallava accents, endless keyboard taksim over a hypnotic two-chord vamp, frantic clarinet ornaments, tarabuka and dumbek double-time under heavy off-beat claps, improvised melismatic vocal stretched over long vowels with sudden high wails, Hijaz scale, fast 125-130 BPM, hypnotic frenetic late-night club energy`,
    googlePrompt: gBg('Tallava with Albanian-Roma accents. Endless keyboard taksim over a hypnotic two-chord vamp, frantic clarinet ornaments, tarabuka and dumbek double-time, heavy off-beat claps, improvised melismatic vocal. 125-130 BPM, hypnotic night-club energy.'),
  },
  lyubov: {
    sunoPrompt: `${CHALGA_CORE}, tender pop-folk love ballad, soft accordion sustained chords, violin counter-melody with glissando, kanun arpeggios, light tarabuka pulse over a deep heartbeat kick, warm ornamented vocal with gentle melisma and long sustained vowels on the chorus, Hijaz with softened quarter-tones, mid-tempo 88-92 BPM, sweet devoted romantic mood`,
    googlePrompt: gBg('Tender pop-folk love ballad. Soft accordion chords, violin glissando, kanun arpeggios, light tarabuka over a heartbeat kick, warm vocal with long sustained vowels on the chorus. 88-92 BPM, sweet and devoted.'),
  },
  maka: {
    sunoPrompt: `${CHALGA_CORE}, song of maka — suffering and heartbreak, slow oriental lament, weeping violin and ney flute fills, gadulka drone underneath, sparse tarabuka pulse, deep dumbek heartbeat kick, crying melismatic vocal with sobs, falsetto breaks and long pitch slides, Hijaz scale with heavy quarter-tone slides, slow 70-78 BPM, dark hopeless melancholic mood`,
    googlePrompt: gBg('Song of maka — suffering and heartbreak. Slow oriental lament with weeping violin, ney fills, gadulka drone, sparse tarabuka, deep heartbeat kick, crying vocal with sobs and falsetto breaks. 70-78 BPM, dark and hopeless.'),
  },
  trompet: {
    sunoPrompt: `${CHALGA_CORE} in Balkan brass band fanfare style, blasting trumpets and trombones trading solos, tuba bass line, snare rolls and tapan on the off-beat, tarabuka groove underneath, accordion answering the horns, melismatic vocal riding over the brass, celebratory shouted background voices, fast 120-128 BPM, joyful sweaty wedding-yard celebration`,
    googlePrompt: gBg('Balkan brass fanfare pop-folk. Blasting trumpets and trombones trading solos, tuba bass, snare rolls and tapan off-beat, accordion answering the horns, shouted background voices. 120-128 BPM, joyful wedding-yard celebration.'),
  },
  orientalna: {
    sunoPrompt: `${CHALGA_CORE}, heavy oriental pop-folk with Turkish-Arabic flavour, oud and saz lead melodies, kanun runs, ney flute fills, maqam Hijaz and Nihavent with quarter-tones, slow rolling darbuka and bendir groove, finger cymbals, crying melismatic vocal with long taksim-like improvised phrases, mid-low tempo 84-90 BPM, sensual smoky eastern mood`,
    googlePrompt: gBg('Heavy oriental pop-folk with Turkish-Arabic flavour. Oud and saz leads, kanun runs, ney fills, maqam Hijaz and Nihavent quarter-tones, slow darbuka and bendir groove, finger cymbals, long taksim-like vocal phrases. 84-90 BPM, sensual and smoky.'),
  },
  luks: {
    sunoPrompt: `${CHALGA_CORE}, luxury flex chalga, big brass stabs alternating with oriental synth lead, deep punchy kick and 808 sub-bass, tarabuka rolls on the accents, fast hi-hat fills, hand claps, confident bragging ornamented vocal with heavy gentle auto-tune, expensive bright polished mix, 100-106 BPM, dramatic VIP-table rich-life mood`,
    googlePrompt: gBg('Luxury flex chalga. Big brass stabs alternating with oriental synth, deep punchy kick and 808 sub-bass, tarabuka rolls, hi-hat fills, confident bragging vocal with auto-tune, expensive polished mix. 100-106 BPM, dramatic VIP mood.'),
  },
  komertsialna: {
    sunoPrompt: `${CHALGA_CORE}, commercial club pop-folk radio hit, huge singable oriental hook on the chorus, the pop-folk DNA stays dominant over the club production, oriental synth lead, tarabuka groove locked with a modern punchy four-on-the-floor kick, off-beat hand claps, kanun and finger-cymbal accents, gentle auto-tune melismatic vocal, bright polished mix, 106-112 BPM, high party energy`,
    googlePrompt: gBg('Commercial club pop-folk radio hit. Huge singable oriental chorus hook, tarabuka locked with a punchy four-on-the-floor kick, off-beat claps, kanun and finger-cymbal accents, gentle auto-tune. 106-112 BPM, high party energy, pop-folk DNA still dominant.'),
  },
  svadbarska: {
    sunoPrompt: `${CHALGA_CORE} in Bulgarian svatbarska wedding-band tradition (Ivo Papazov school), virtuoso clarinet lead with lightning-fast ornamented runs, saxophone and accordion trading improvised solos, electric bass and tapan driving irregular Balkan meters, tarabuka fills, shouted celebratory background vocals between instrumental breaks, fast 118-126 BPM, wild live wedding-yard energy`,
    googlePrompt: gBg('Bulgarian svatbarska wedding-band music, Ivo Papazov school. Virtuoso clarinet lead, saxophone and accordion trading improvised solos, electric bass and tapan in irregular Balkan meters, shouted celebratory voices. 118-126 BPM, wild live wedding energy.'),
  },
  nazdrave: {
    sunoPrompt: `${CHALGA_CORE}, festive drinking song with live kafene band feel, accordion and clarinet trade solos, gadulka and violin fills, tarabuka and tapan groove, hand claps on the off-beat, glasses-clinking foley, shouted celebratory background vocals answering the lead, warm ornamented lead vocal with raised-glass energy, mid-tempo 98-104 BPM, joyful table-party mood`,
    googlePrompt: gBg('Festive drinking song with live kafene band feel. Accordion and clarinet trading solos, gadulka and violin fills, tarabuka and tapan, off-beat claps, glasses clinking, shouted background voices. 98-104 BPM, joyful table-party mood.'),
  },
};

/**
 * Ocazii — text BG. Id-urile sunt cele moștenite din catalogul RO (vezi antet),
 * conținutul e bulgăresc: hint scurt care se lipește de style string.
 */
export const OCCASION_PROMPT_SEED_BG: CatalogPromptSeedMap = {
  zi: {
    sunoPrompt: 'birthday celebration, честит рожден ден, festive family gathering',
    googlePrompt: 'Birthday celebration for the named person. Festive „честит рожден ден” energy, family gathering, raised glasses, warm and joyful.',
  },
  nunta: {
    sunoPrompt: 'wedding celebration, младоженци, сватбено хоро',
    googlePrompt: 'Wedding celebration. Младоженци, сватбено хоро, blessing the couple, big family party, joyful and ceremonial.',
  },
  botez: {
    sunoPrompt: 'christening, кръщене, кръстници и семейство',
    googlePrompt: 'Christening / кръщене. Bless the child, кръстници, family gathering, tender and festive at once.',
  },
  cumatrie: {
    sunoPrompt: 'godparent feast, кумова трапеза, вдигнати чаши',
    googlePrompt: 'Кумова трапеза feast. Кръстници and family at the table, raised glasses, warm kinship, celebratory pop-folk.',
  },
  cuplu: {
    sunoPrompt: 'couple anniversary, годишнина, години заедно',
    googlePrompt: 'Couple anniversary. Години заедно, devoted love, romantic but still chalga — warm, not a pop ballad.',
  },
  sef: {
    sunoPrompt: 'boss respect, шефе, уважение на работа',
    googlePrompt: 'Dedication for the boss (шефе). Respect, loyalty, a bit of swagger, workplace family energy.',
  },
  dragoste: {
    sunoPrompt: 'love declaration, сърце мое, романтично признание',
    googlePrompt: 'Love declaration. Direct confession to the named person, „сърце мое”, devoted and emotional, still pop-folk.',
  },
  roast: {
    sunoPrompt: 'friendly roast, закачка с приятел, шеговити подмятания',
    googlePrompt: 'Friendly roast of a pal. Playful teasing (закачка), never mean, party laughter, still sung as chalga and not comedy rap.',
  },
  nas: {
    sunoPrompt: 'godfather / godson, кум и кръщелник, семейна връзка',
    googlePrompt: 'For кум or кръщелник. Family bond, respect, wedding-family energy, loyalty between godparent and godchild.',
  },
  inmorm: {
    sunoPrompt: 'memorial, помен, бавна песен на скръб',
    googlePrompt: 'Memorial / помен. Slow, respectful song of maka and remembrance of the named person, no party energy.',
  },
  motiv: {
    sunoPrompt: 'motivational, стани, бори се, не се предавай',
    googlePrompt: 'Motivational pop-folk. Стани, бори се, не се предавай — proud and driving, still sung chalga, not a rap anthem.',
  },
  altul: {
    sunoPrompt: 'personal dedication, посвещение, обща празнична песен',
    googlePrompt: 'Personal dedication and general celebration for the named person, flexible festive pop-folk energy.',
  },
};

/* ========================================================================== *
 *  EL — doroparaggelia.gr. Gen: laïko / skiladiko grecesc. Versuri: greacă.   *
 * ========================================================================== */

const LAIKO_CORE =
  "authentic Greek LAÏKO / skiladiko (NOT pop, NOT EDM, NOT generic dance, NOT trap-rap), bouzouki-led Greek popular music with strong oriental DNA, Greek dromoi (Hijaz, Ousak, Rast) with quarter-tone slides, ornamented melismatic lead vocal with trademark sung interjections ('opa', 'aman', 'ela'), toumperleki and baglamas colour, Greek language";

const LAIKO_GOOGLE_CORE =
  'Create a full-length authentic Greek laïko / skiladiko song (not pop, not EDM, not trap-rap, not generic dance). Bouzouki-led Greek popular music with oriental dromoi (Hijaz, Ousak, Rast), baglamas, toumperleki, accordion and ornamented Greek vocals with sung interjections (opa, aman, ela). Language: Greek. Follow the provided lyrics exactly, keeping verse/chorus structure.';

function gEl(detail: string): string {
  return `${LAIKO_GOOGLE_CORE} ${detail}`;
}

/** Stiluri — text EL (vezi antetul fișierului: NU se aplică pe alte limbi). */
export const STYLE_PROMPT_SEED_EL: CatalogPromptSeedMap = {
  klasiko: {
    sunoPrompt: `${LAIKO_CORE}, classic 1960s-80s laïko, twin bouzoukia carrying the melody in thirds, baglamas answering, accordion and piano comping, deep upright-feel bass, toumperleki with a light drum kit in a steady laïko 4/4 groove, warm chesty ornamented vocal with natural vibrato and clean articulation, dromoi Ousak and Rast, mid-tempo 96-104 BPM, proud nostalgic taverna mood`,
    googlePrompt: gEl('Classic 1960s-80s laïko. Twin bouzoukia in thirds, baglamas answering, accordion and piano comping, deep bass, toumperleki with a light kit in a steady 4/4 laïko groove, warm chesty vocal with natural vibrato. 96-104 BPM, proud nostalgic taverna mood.'),
  },
  skiladiko: {
    sunoPrompt: `${LAIKO_CORE}, night skiladiko from a 1990s Athens bouzoukia club, crying bouzouki lead with tremolo and long weeping bends, dramatic synth strings and orchestral hits on the refrain, electric bass, heavy toumperleki over a punchy kick, sobbing melismatic vocal with cracks and falsetto breaks, dromos Hijaz, slow-mid 82-90 BPM, drunken heartbreak after-midnight mood`,
    googlePrompt: gEl('Night skiladiko from a 1990s Athens bouzoukia club. Crying bouzouki with tremolo and weeping bends, dramatic synth strings, heavy toumperleki over a punchy kick, sobbing vocal with cracks and falsetto. 82-90 BPM, drunken after-midnight heartbreak.'),
  },
  rembetiko: {
    sunoPrompt: `${LAIKO_CORE}, old-school rebetiko of the Piraeus era, single bouzouki and baglamas with sparse plucked lines, acoustic guitar strumming the bass, no drum kit — only light toumperleki and finger snaps, dark raw close-miked vocal with unpolished ornaments, dromoi Ousak and Hijaz, slow 78-88 BPM, smoky underground tekes melancholy, warm lo-fi acoustic recording feel`,
    googlePrompt: gEl('Old-school rebetiko of the Piraeus era. Single bouzouki and baglamas, sparse plucked lines, acoustic guitar bass, no drum kit — only light toumperleki, dark raw close-miked vocal. 78-88 BPM, smoky underground melancholy, warm lo-fi feel.'),
  },
  nisiotiko: {
    sunoPrompt: `${LAIKO_CORE} in island nisiotiko tradition, lead violin with fast ornamented runs, laouto strumming the rhythm, santouri and tsampouna accents, no heavy percussion — only toumbi and hand claps, bright open-air vocal with clear island ornaments, major and Rast modes, fast 118-126 BPM, sunny seaside village-festival dance energy`,
    googlePrompt: gEl('Island nisiotiko. Lead violin with fast ornamented runs, laouto rhythm strumming, santouri and tsampouna accents, only toumbi and hand claps for percussion, bright open-air vocal. 118-126 BPM, sunny seaside village-festival dance.'),
  },
  anatoliko: {
    sunoPrompt: `${LAIKO_CORE}, oriental Anatolian laïko, oud and kanun leading the melody, ney flute fills, bouzouki answering with tremolo, maqam Hijaz and Nihavent with quarter-tone slides, slow rolling toumperleki and bendir groove, finger cymbals, deeply melismatic vocal with long amanes-style improvised phrases, 84-90 BPM, smoky sensual eastern mood`,
    googlePrompt: gEl('Oriental Anatolian laïko. Oud and kanun leading, ney fills, bouzouki tremolo answers, maqam Hijaz and Nihavent quarter-tones, slow toumperleki and bendir groove, finger cymbals, long amanes-style vocal phrases. 84-90 BPM, smoky and sensual.'),
  },
  zeimbekiko: {
    sunoPrompt: `${LAIKO_CORE}, heavy zeibekiko in 9/8 odd meter, bouzouki lead with dramatic tremolo and long dramatic pauses, baglamas fills, piano and synth strings swelling into the refrain, deep toumperleki accents marking the 9/8 cycle, proud aching vocal with wide vibrato and melismatic runs, dromos Hijaz, slow-mid 88-96 BPM, solitary dignified pain, dancing alone with open arms`,
    googlePrompt: gEl('Heavy zeibekiko in 9/8. Bouzouki lead with dramatic tremolo and long pauses, baglamas fills, strings swelling into the refrain, deep toumperleki marking the 9/8 cycle, proud aching vocal with wide vibrato. 88-96 BPM, solitary dignified pain.'),
  },
  tsifteteli: {
    sunoPrompt: `${LAIKO_CORE}, tsifteteli oriental dance in a 4/4 belly-dance groove, bouzouki and oud trading the hook, kanun runs, darbuka and toumperleki with tambourine and finger cymbals, hip-swinging bass line, teasing playful melismatic vocal with sliding ornaments, dromos Hijaz, mid-tempo 100-108 BPM, hot flirtatious dance-floor mood`,
    googlePrompt: gEl('Tsifteteli oriental dance in a 4/4 belly-dance groove. Bouzouki and oud trading the hook, kanun runs, darbuka and toumperleki with tambourine and finger cymbals, hip-swinging bass, teasing playful vocal. 100-108 BPM, hot and flirtatious.'),
  },
  panigyradiko: {
    sunoPrompt: `${LAIKO_CORE} in mainland panigiri festival style, klarino lead with virtuoso ornamented runs, violin and laouto answering, defi tambourine and daouli drum driving the dance, bouzouki underneath, shouted celebratory background voices, dromoi Hijaz and Rast, fast 120-130 BPM, village-square all-night feast energy`,
    googlePrompt: gEl('Mainland panigiri festival music. Klarino lead with virtuoso ornamented runs, violin and laouto answering, defi tambourine and daouli driving the dance, shouted celebratory voices. 120-130 BPM, village-square all-night feast energy.'),
  },
  'laiko-agapis': {
    sunoPrompt: `${LAIKO_CORE}, warm laïko love song, bouzouki lead with tender tremolo, acoustic guitar arpeggios, accordion and soft strings, gentle toumperleki pulse over a heartbeat kick, affectionate ornamented vocal with long sustained vowels on the chorus, dromoi Rast and Ousak, mid-tempo 90-96 BPM, devoted romantic mood`,
    googlePrompt: gEl('Warm laïko love song. Bouzouki with tender tremolo, acoustic guitar arpeggios, accordion and soft strings, gentle toumperleki over a heartbeat kick, affectionate vocal with long sustained vowels. 90-96 BPM, devoted and romantic.'),
  },
  'laiko-kaymou': {
    sunoPrompt: `${LAIKO_CORE}, laïko of kaïmos — deep sorrow, slow lament, weeping bouzouki tremolo, mournful violin counter-melody, sparse piano chords, deep toumperleki heartbeat, crying melismatic vocal with sobs, cracks and long pitch slides, dromos Hijaz with heavy quarter-tones, slow 72-80 BPM, bitter heartbroken late-night mood`,
    googlePrompt: gEl('Laïko of kaïmos — deep sorrow. Slow lament with weeping bouzouki tremolo, mournful violin counter-melody, sparse piano, deep toumperleki heartbeat, crying vocal with sobs and pitch slides. 72-80 BPM, bitter and heartbroken.'),
  },
  emporiko: {
    sunoPrompt: `${LAIKO_CORE}, modern commercial laïko radio hit, bouzouki hook doubled by an oriental synth lead, programmed drums with a punchy modern kick under the toumperleki, off-beat hand claps, big singable chorus, gentle auto-tune on the melismatic vocal, laïko DNA stays dominant over the pop production, bright polished vocal-forward mix, 104-110 BPM, confident party energy`,
    googlePrompt: gEl('Modern commercial laïko radio hit. Bouzouki hook doubled by an oriental synth, programmed drums with a punchy kick under the toumperleki, off-beat claps, big singable chorus, gentle auto-tune, bright polished mix. 104-110 BPM, confident party energy, laïko DNA still dominant.'),
  },
  syrtaki: {
    sunoPrompt: `${LAIKO_CORE} in syrtaki / hasapiko form, twin bouzoukia melody starting slow and accelerating, guitar and bass driving the hasaposerviko groove, accordion fills, light drum kit with rim shots and hand claps, cheerful ornamented vocal with shouted 'opa' answers, dromoi Rast and natural minor, accelerating from 100 to 150 BPM, joyful arm-in-arm dance-line celebration`,
    googlePrompt: gEl('Syrtaki / hasapiko. Twin bouzoukia starting slow and accelerating, guitar and bass driving the hasaposerviko groove, accordion fills, light kit with rim shots and claps, cheerful vocal with shouted opa answers. Accelerating from 100 to 150 BPM, joyful dance-line celebration.'),
  },
};

/** Ocazii — text EL: hint scurt care se lipește de style string. */
export const OCCASION_PROMPT_SEED_EL: CatalogPromptSeedMap = {
  genethlia: {
    sunoPrompt: 'birthday celebration, χρόνια πολλά, festive family gathering',
    googlePrompt: 'Birthday celebration for the named person. Festive „χρόνια πολλά” energy, family gathering, raised glasses, warm and joyful.',
  },
  gamos: {
    sunoPrompt: 'wedding celebration, γαμπρός και νύφη, wedding glenti',
    googlePrompt: 'Wedding celebration. Γαμπρός και νύφη, wedding glenti, blessing the couple, big family party, joyful and ceremonial.',
  },
  vaptisi: {
    sunoPrompt: 'christening, βάφτιση, νονός και οικογένεια',
    googlePrompt: 'Christening / βάφτιση. Bless the child, νονός and νονά, family gathering, tender and festive at once.',
  },
  nonos: {
    sunoPrompt: 'godfather, νονός και βαφτιστήρι, family bond',
    googlePrompt: 'For the νονός. Family bond, respect and gratitude, warm celebratory laïko between godfather and godchild.',
  },
  epeteios: {
    sunoPrompt: 'anniversary, επέτειος, χρόνια μαζί',
    googlePrompt: 'Anniversary. Χρόνια μαζί, devoted love through the years, romantic but still laïko — warm, not a pop ballad.',
  },
  afentiko: {
    sunoPrompt: 'boss respect, αφεντικό, respect at work',
    googlePrompt: 'Dedication for the boss (αφεντικό). Respect, loyalty, a bit of swagger, workplace family energy.',
  },
  agapi: {
    sunoPrompt: 'love declaration, καρδιά μου, romantic confession',
    googlePrompt: 'Love declaration. Direct confession to the named person, „καρδιά μου”, devoted and emotional, still laïko.',
  },
  plaka: {
    sunoPrompt: 'friendly roast, πλάκα με φίλο, playful teasing',
    googlePrompt: 'Friendly roast of a pal. Playful teasing (πλάκα), never mean, party laughter, still sung as laïko and not comedy rap.',
  },
  koumparos: {
    sunoPrompt: 'best man, κουμπάρος, wedding brotherhood',
    googlePrompt: 'For the κουμπάρος. Wedding brotherhood, loyalty and inside jokes, celebratory laïko with glasses raised.',
  },
  mnimosino: {
    sunoPrompt: 'memorial, μνημόσυνο, remembrance',
    googlePrompt: 'Memorial / μνημόσυνο. Slow, respectful laïko of kaïmos, remembrance of the named person, no party energy.',
  },
  dynamis: {
    sunoPrompt: 'motivational, σήκω, πάλεψε, μην τα παρατάς',
    googlePrompt: 'Motivational laïko. Σήκω, πάλεψε, μην τα παρατάς — proud and driving, still sung laïko, not a rap anthem.',
  },
  allo: {
    sunoPrompt: 'personal dedication, αφιέρωση, general celebration',
    googlePrompt: 'Personal dedication and general celebration for the named person, flexible festive laïko energy.',
  },
};

/**
 * Seed-uri pe limbă. Cheia = `site.locale` normalizat („ro”, „bg”, „el”…).
 *
 * Un site pe o limbă care NU e aici nu primește nimic automat — rollout-ul îi
 * raportează prompturile lipsă și îl trimite să le scrie manual din Catalog, în
 * loc să-i injecteze limba și genul altei piețe în generări.
 */
export const CATALOG_SEEDS: Record<string, CatalogPromptSeedSet> = {
  ro: { locale: 'ro', styles: STYLE_PROMPT_SEED, occasions: OCCASION_PROMPT_SEED },
  bg: { locale: 'bg', styles: STYLE_PROMPT_SEED_BG, occasions: OCCASION_PROMPT_SEED_BG },
  el: { locale: 'el', styles: STYLE_PROMPT_SEED_EL, occasions: OCCASION_PROMPT_SEED_EL },
};

/** Limbile pentru care avem seed, pentru mesaje în admin. */
export const SEEDED_LOCALES: string[] = Object.keys(CATALOG_SEEDS);

/** „ro-RO” / „ RO ” → „ro”. Gol dacă nu e limbă validă. */
export function normalizeSeedLocale(locale?: string | null): string {
  if (typeof locale !== 'string') return '';
  return locale.trim().toLowerCase().split(/[-_]/)[0];
}

/** Seed-ul limbii sau `null` dacă nu avem prompturi scrise pentru ea. */
export function seedForLocale(locale?: string | null): CatalogPromptSeedSet | null {
  const key = normalizeSeedLocale(locale);
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(CATALOG_SEEDS, key) ? CATALOG_SEEDS[key] : null;
}

/**
 * Rândul din seed pentru un id. Folosește hasOwnProperty ca un id ca
 * „constructor” sau „toString” să nu întoarcă ceva de pe Object.prototype.
 */
export function seedRow(map: CatalogPromptSeedMap | null | undefined, id: string): CatalogPromptSeed | null {
  if (!map || typeof id !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(map, id) ? map[id] : null;
}
