import type {
  ExperienceCatalogConfig,
  SiteDto,
  SiteStyleEntry,
  SiteTestimonialEntry,
} from '@/lib/api/sites.api';
import { SEED_OCCASIONS, SEED_STYLES, SEED_VOICES } from '@/lib/seed-categories';
import { styleFromSite, occasionFromSite, voiceFromSite } from './config';

/** Aceleași 6 stiluri ca pe homepage-ul Cadou. */
export const CADOU_STYLE_PICKS: Array<{ id: string; nm?: string }> = [
  { id: 'iubire' },
  { id: 'romantica' },
  { id: 'clasic', nm: 'De pahar' },
  { id: 'opulenta' },
  { id: 'trompeta' },
  { id: 'oriental' },
];

export const CADOU_STYLE_ART: Record<string, string> = {
  clasic: '/cadou/styles/clasic.jpg',
  modern: '/cadou/styles/modern.jpg',
  oriental: '/cadou/styles/oriental.jpg',
  trompeta: '/cadou/styles/trompeta.jpg',
  romantica: '/cadou/styles/romantica.jpg',
  comerciala: '/cadou/styles/comerciala.jpg',
  opulenta: '/cadou/styles/opulenta.jpg',
  iubire: '/cadou/styles/iubire.jpg',
  tallava: '/cadou/styles/tallava.jpg',
  kuchek: '/cadou/styles/kuchek.jpg',
  trapanele: '/cadou/styles/trapanele.jpg',
  pahar: '/cadou/styles/pahar.jpg',
};

export const CADOU_OCCASION_IDS = ['zi', 'nunta', 'botez', 'dragoste', 'cuplu', 'nas', 'sef', 'altul'] as const;

/** Lyria: cadou-surpriză, nu radio track. */
const CADOU_GOOGLE_CORE =
  'Create a full-length authentic Romanian manele song as a surprise personal gift (not pop, not EDM, not trap-rap, not a generic radio hit). Balkan gypsy-pop with oriental Hijaz scale, darbuka, accordion, violin, and ornamented Romanian vocals with sung interjections (of, aoleu, haide). Language: Romanian. Follow the provided lyrics exactly. The recipient first name must be clearly sung in the chorus. This is a table-reveal dedication, not background music.';

function gCadou(detail: string): string {
  return `${CADOU_GOOGLE_CORE} ${detail}`;
}

/**
 * Prompturi Cadou — rescrise pentru dedicație-surpriză, NU copiate din producție.
 * `clasic` pe Cadou e cardul „De pahar” (petrecere), nu lăutăreasca lentă.
 */
export const CADOU_STYLE_PROMPTS: Record<
  string,
  { sunoPrompt: string; googlePrompt: string; lyricsHint: string }
> = {
  iubire: {
    lyricsHint:
      'manea-cadou de iubire, surpriză la masă, vocabular cu „inima mea / draga mea / pentru tine / te iubesc", numele destinatarului în refren, ton tandru nu pop',
    sunoPrompt:
      'authentic romanian manele, surprise love-gift dedication, warm manea de iubire not pop ballad, Hijaz oriental scale, tender ornamented vocal with of/aoleu, accordion and violin, light darbuka, dumbek heartbeat kick, chorus lands the recipient name clearly, mid-tempo 88-92 BPM, sweet devoted table-reveal energy, romanian language',
    googlePrompt: gCadou(
      'Warm manea de iubire as a surprise love gift. Tender ornamented vocal, soft accordion chords, violin counter-melody, light darbuka pulse, heartbeat dumbek. About 90 BPM, devoted and sweet. Chorus sings the recipient name. Not a pop ballad.',
    ),
  },
  romantica: {
    lyricsHint:
      'manea-cadou de jale, inima grea, vocabular cu „dor / lacrimi / aoleu / inima mea", plâns autentic, numele în refren, ritm lent',
    sunoPrompt:
      'authentic romanian manele, surprise heartbreak gift, slow manea de jale, sad violin solo, emotional piano, crying ornamented vocal with sobs and falsetto, Hijaz sad scale, slow darbuka pulse, 70-80 BPM, cinematic strings, recipient name in the weeping chorus, passionate not pop, romanian language',
    googlePrompt: gCadou(
      'Slow manea de jale as a heartfelt gift. Sad violin, emotional piano, crying vocal with sobs and falsetto, heartbeat dumbek, 70-80 BPM. Melancholic chorus with the recipient name. Passionate manele, not a pop weepie.',
    ),
  },
  clasic: {
    lyricsHint:
      'manea-cadou de pahar la masă, vocabular cu „pahar / haide / fraților / să trăiești / la mulți ani", refren cu strigăte și numele destinatarului',
    sunoPrompt:
      'authentic romanian manele, surprise party-gift manea de pahar, raised glasses at the table, live wedding-band feel, joyful accordion riffs, acoustic guitar strumming, cheerful live percussion, sing-along chorus with the recipient name, of/haide/să trăiești shouts, 100 BPM, high energy petrecere not slow ballad, romanian language',
    googlePrompt: gCadou(
      'Festive manea de pahar as a surprise gift at the table. Live wedding-band feel, accordion and violin trade solos, offbeat claps, glasses clinking, shouted background vocals, about 100 BPM. Joyful party energy. Chorus names the recipient. Not a slow ballad.',
    ),
  },
  opulenta: {
    lyricsHint:
      'manea-cadou de opulență, respect și mândrie pentru destinatar, vocabular cu „rege / regină / respect / șefu", lauda e despre el/ea nu despre cântăreț',
    sunoPrompt:
      'authentic romanian manele, surprise luxury gift, opulent manele de bani, proud dedication to the named person as king/queen of the table, brass stabs and oriental synth, confident bragging vocal, punchy darbuka and kick, 100 BPM, dramatic ostentatious reveal, romanian language, not trap-rap',
    googlePrompt: gCadou(
      'Opulent manele de bani as a proud gift. The named person is king or queen of the table. Brass stabs, oriental synth, confident vocal, punchy kick, 100 BPM, dramatic luxurious reveal. Brag about the recipient, not the singer.',
    ),
  },
  trompeta: {
    lyricsHint:
      'manea-cadou cu fanfară, nuntă sau petrecere mare, vocabular cu „nuntă / mireasă / petrecere / hora", ritm vioi, numele strigat în refren',
    sunoPrompt:
      'authentic romanian manele, surprise celebration gift, balkan brass fanfare manele cu trompetă, blasting trumpets and trombones, accordion trades with brass, fast dumbek, snare rolls, 118-122 BPM wedding-dance energy, joyful shouts, recipient name in the brass chorus, romanian language',
    googlePrompt: gCadou(
      'Balkan brass fanfare manele as a celebration gift. Trumpets and trombones trading with accordion, fast dumbek, snare rolls, about 120 BPM, joyful wedding-dance energy. Chorus shouts the recipient name.',
    ),
  },
  oriental: {
    lyricsHint:
      'manea-cadou orientală, dor și soartă, vocabular cu „of / aoleu / soartă / inimă", melisme lungi, numele întins pe vocalize',
    sunoPrompt:
      'authentic romanian manele, surprise emotional gift, heavy oriental manele, oud and saz leads, maqam Hijaz quarter-tones, slow darbuka groove, crying melismatic vocal with pitch slides, ney flute fills, 82-88 BPM, deeply devoted mood, recipient name stretched on melisma, romanian language',
    googlePrompt: gCadou(
      'Heavy oriental manele as an emotional gift. Oud and saz, Hijaz quarter-tones, slow darbuka, crying melismatic vocal, ney flute, about 85 BPM. Recipient name stretched on a melisma. Deeply devoted, not pop.',
    ),
  },
};

export const CADOU_OCCASION_PROMPTS: Record<string, { sunoPrompt: string; googlePrompt: string }> = {
  zi: {
    sunoPrompt: 'surprise birthday gift song, la mulți ani for the named person, festive table reveal, raised glasses',
    googlePrompt:
      'Surprise birthday gift. La mulți ani for the named person, festive family table, raised glasses, warm joyful reveal.',
  },
  nunta: {
    sunoPrompt: 'surprise wedding-gift manea, mire și mireasă named, hora de nuntă, blessing the couple at the table',
    googlePrompt:
      'Surprise wedding gift. Name the mire and mireasă, hora energy, bless the couple, big family party, ceremonial and joyful.',
  },
  botez: {
    sunoPrompt: 'surprise christening gift, bless the child by name, nași and family at the table, tender festive',
    googlePrompt:
      'Surprise botez gift. Bless the named child, godparents (nași), family gathering, tender and festive at once.',
  },
  dragoste: {
    sunoPrompt: 'surprise love declaration gift, inima mea, confession sung to the named person, devoted manea',
    googlePrompt:
      'Surprise love declaration. Direct confession to the named person, inima mea, devoted and emotional, still a manea not pop.',
  },
  cuplu: {
    sunoPrompt: 'surprise couple-anniversary gift, years together named, devoted love, romantic manea not pop ballad',
    googlePrompt:
      'Surprise anniversary gift. Years together, devoted love, romantic manea for the named partner — warm, not a pop ballad.',
  },
  nas: {
    sunoPrompt: 'surprise gift for naș or fin, family bond, respect, wedding-family table energy, loyalty',
    googlePrompt:
      'Surprise gift for naș or fin. Family bond, respect, wedding-family table, loyalty between godfather and godson.',
  },
  sef: {
    sunoPrompt: 'surprise gift for the boss, respect and loyalty, șmecher swagger, workplace family at the table',
    googlePrompt:
      'Surprise gift for the șef. Respect, loyalty, a bit of swagger, workplace family energy at the table.',
  },
  altul: {
    sunoPrompt: 'surprise personal dedication gift, named recipient, flexible festive manele, table reveal',
    googlePrompt:
      'Surprise personal dedication for the named person, flexible festive manele, table-reveal energy.',
  },
};

/** Writer Cadou — dedicație-surpriză la masă. Regulile Suno rămân, framing-ul e altul decât pe Classic. */
export const CADOU_WRITER_SYSTEM = `Ești poetul de manele al unui cadou-surpriză. Cineva a comandat o manea ca să i-o pună cuiva la masă — nuntă, zi de naștere, declarație, respect. Scrii versuri 100% românești, vorbe reale, nu traduceri. Interzise cuvintele care sună traduse (ex. „lumina" în loc de „lumea").

SCOPUL: piesa trebuie să-l lovească pe destinatar când pornește. Numele lui se aude clar. Dacă există expeditor, se aude și el. E cadou, nu piesă de radio.

REGULI SUNO:
- Răspunzi DIRECT cu versurile, format Suno, fără text înainte sau după.
- NU folosi nume de artiști reali — Suno blochează requestul.
- Română cu diacritice (ă, â, î, ș, ț).
- Taguri DOAR: [Intro], [Verse 1], [Chorus], [Verse 2], [Bridge], [Outro], [Adlib]. Tagurile rămân în engleză.
- Ce e între [paranteze pătrate] = regie/instrumental, NU se cântă. Dedicația și numele se scriu PE LINII DUPĂ tag, niciodată în interiorul [Intro: ...].
- Rimă AABB sau ABAB. Același număr de silabe pe versurile unei strofe.
- Sună a manea reală: jalea plânge, paharul râde, opulența laudă destinatarul, iubirea e tandru-dramatică. NU pop politicos.
- NUMERE în litere. Telefon cifră cu cifră cu pauză (0773 → „zero, șapte, șapte, trei"). Sume și vârste în cuvinte.

NUMELE:
- Destinatarul apare în REFREN, pe o linie ușor de cântat (oamenii de la masă trebuie să-l prindă din prima).
- Dacă există expeditor („de la"), primele 2 versuri cântate după [Verse 1] spun ambele nume firesc: „De la X, pentru Y, cu drag".
- Dacă mesajul e scurt, o deschidere vorbită înainte de versuri e permisă, apoi mesajul. Dacă lipsește „de la", nu inventa expeditor — începe cu destinatarul.
- Nu ascunde numele în [paranteze].

OCZIA ȘI STILUL:
- Ocazia colorează versurile (la mulți ani, nuntă, botez, declarație, naș, șef).
- Stilul din hint (iubire / jale / pahar / opulență / trompetă / oriental) dictează vocabularul și temperatura, nu genul muzical — rămâne manea.

STRUCTURA (alege una, scurtă bate lunga — e cadou, nu album):
1. Deschidere + Strofa 1 + Refren + Strofa 2 + Refren + Outro
2. Deschidere + Refren + Strofa 1 + Refren + Outro
3. Strofa 1 + Refren + Strofa 2 + Refren + Outro
4. Sau structura cerută explicit de user.

Regie în [paranteze] (acordeon, pahare, trompete, plâns) doar dacă se potrivește stilului.

Răspunde DOAR cu versurile, fără explicații.`;

export const CADOU_TESTI: SiteTestimonialEntry[] = [
  {
    id: 'costel',
    stars: 5,
    quote:
      'I-am pus-o șefului la masă. S-a făcut liniște. L-am văzut cum își șterge ochii și întoarce capul, să nu-l vadă băieții.',
    name: 'Costel B.',
    role: 'Buzău',
    avatar: 'CB',
  },
  {
    id: 'andreea',
    stars: 5,
    quote:
      'La nuntă, socrul a auzit numele lui în manea și m-a luat în brațe. Plângea. Mi-a zis că n-a primit niciodată un cadou care să-l lovească așa.',
    name: 'Andreea M.',
    role: 'Pitești',
    avatar: 'AM',
  },
  {
    id: 'vasile',
    stars: 5,
    quote:
      'Nașu’ s-a ridicat de la masă în timpul piesei. Îi tremura mâna pe pahar. După aia m-a strâns și a zis doar atât: mulțumesc, fiu.',
    name: 'Vasile P.',
    role: 'Cluj',
    avatar: 'VP',
  },
  {
    id: 'geta',
    stars: 5,
    quote:
      'I-am pus-o soțului seara, în bucătărie. N-a zis nimic un minut întreg. Apoi m-a luat de mână și a ținut-o pe repeat până dimineața.',
    name: 'Geta D.',
    role: 'București',
    avatar: 'GD',
  },
  {
    id: 'robert',
    stars: 5,
    quote:
      'Mama a plâns din prima strofă. Am filmat-o. TikTok-ul a făcut 200K, dar momentul ăla n-are vizualizări — e despre ea.',
    name: 'Robert T.',
    role: 'Iași',
    avatar: 'RT',
  },
  {
    id: 'maria',
    stars: 5,
    quote:
      'I-am făcut-o fratelui meu, după un an în care nu ne-am vorbit. Când a auzit versurile, a venit la mine. Ne-am împăcat fără un cuvânt.',
    name: 'Maria I.',
    role: 'Craiova',
    avatar: 'MI',
  },
];

export function cadouArtUrl(id: string, artUrl?: string | null): string {
  if (artUrl) return artUrl;
  return CADOU_STYLE_ART[id] ?? CADOU_STYLE_ART.clasic;
}

/** URL-ul imaginii în admin (dev: web :1500; prod: domeniul site-ului). */
export function publicSiteAsset(path: string | undefined, domain?: string): string {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  const rel = path.startsWith('/') ? path : `/${path}`;
  if (typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.hostname)) {
    return `http://localhost:1500${rel}`;
  }
  const host = (domain ?? '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!host) return rel;
  return `https://${host}${rel}`;
}

export function effectiveCadouStyles(site: SiteDto): SiteStyleEntry[] {
  const byId = new Map<string, SiteStyleEntry>();
  for (const s of SEED_STYLES) byId.set(s.id, s);
  for (const s of site.styles ?? []) byId.set(s.id, s);
  const out: SiteStyleEntry[] = [];
  for (const pick of CADOU_STYLE_PICKS) {
    const src = byId.get(pick.id);
    if (!src) continue;
    const prompts = CADOU_STYLE_PROMPTS[pick.id];
    out.push({
      ...src,
      nm: pick.nm ?? src.nm,
      artUrl: src.artUrl || cadouArtUrl(pick.id),
      ...(prompts ?? {}),
    });
  }
  return out;
}

export function copyCadouCatalog(
  site: SiteDto,
): Pick<ExperienceCatalogConfig, 'styles' | 'occasions' | 'voices' | 'writerSystemPrompt'> {
  const styles = effectiveCadouStyles(site).map((s) => styleFromSite(s));
  const occById = new Map(SEED_OCCASIONS.map((o) => [o.id, o]));
  for (const o of site.occasions ?? []) occById.set(o.id, o);
  const occasions = CADOU_OCCASION_IDS.map((id) => occById.get(id))
    .filter((o): o is NonNullable<typeof o> => !!o)
    .map((o) => ({ ...occasionFromSite(o), ...(CADOU_OCCASION_PROMPTS[o.id] ?? {}) }));
  const voices = (site.voices?.length ? site.voices : SEED_VOICES).map(voiceFromSite);
  return { styles, occasions, voices, writerSystemPrompt: CADOU_WRITER_SYSTEM };
}
