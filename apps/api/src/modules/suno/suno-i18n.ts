/**
 * Ce trimitem la Suno în limba potrivită.
 *
 * Două lucruri plecau greșit pe site-urile non-RO (găsite 1 sep 2026 într-un
 * payload real de pe `chalgapodarok.bg`):
 *
 * 1. `title` era construit ca „Pentru {destinatar}, de la {expeditor}" —
 *    românește, cu nume bulgărești în el.
 * 2. `style` se termina cu „themed for zi": `occasionStyleHint` cade pe ID-ul
 *    intern al ocaziei când `sunoPrompt` nu e configurat, iar pe producție
 *    NICIUNA dintre cele 24 de ocazii de pe bg/el nu îl are. Pe bg ID-urile
 *    sunt chiar românești (`zi`, `nunta`, `botez`), pe el sunt grecești
 *    transliterate (`genethlia`, `gamos`) — în ambele cazuri, cuvinte pe care
 *    Suno nu le înțelege, într-un `style` altfel integral în engleză.
 *
 * Restul tag-ului de stil rămâne în ENGLEZĂ intenționat: e limbajul în care
 * Suno descrie genuri și instrumente. Doar ocazia trebuia tradusă tot în
 * engleză, nu lăsată ca identificator intern.
 */

/** Titlul piesei, în limba site-ului. Apare în biblioteca Suno și în metadate. */
export function sunoTitle(
  locale: string | null | undefined,
  recipient: string,
  dedication?: string | null,
): string {
  const l = (locale ?? '').trim().toLowerCase().split('-')[0];
  const from = dedication?.trim();
  switch (l) {
    case 'bg':
      return from ? `За ${recipient}, от ${from}` : `За ${recipient}`;
    case 'el':
      return from ? `Για ${recipient}, από ${from}` : `Για ${recipient}`;
    case 'ro':
    case '':
      return from ? `Pentru ${recipient}, de la ${from}` : `Pentru ${recipient}`;
    default:
      return from ? `For ${recipient}, from ${from}` : `For ${recipient}`;
  }
}

/**
 * ID intern de ocazie → descriere ENGLEZĂ pentru tag-ul de stil.
 *
 * Acoperă ambele seturi de identificatori din producție: cele românești
 * (folosite și de site-ul bulgar, care a moștenit catalogul) și cele grecești.
 * `null` = ocazie fără temă utilă („altceva") — atunci nu adăugăm nimic, ceea ce
 * e mai bine decât un cuvânt fără sens pentru model.
 */
const OCCASION_EN: Record<string, string | null> = {
  // Catalogul românesc (folosit de manelecadou.ro, manele-top.ro și chalgapodarok.bg)
  zi: 'birthday',
  nunta: 'wedding',
  botez: 'christening',
  cumatrie: 'godparents celebration',
  cuplu: 'couple in love',
  dragoste: 'love song',
  inmorm: 'memorial tribute',
  motiv: 'motivational anthem',
  nas: 'godfather tribute',
  roast: 'humorous roast',
  sef: 'boss tribute',
  altul: null,
  // Catalogul grecesc (doroparaggelia.gr)
  genethlia: 'birthday',
  gamos: 'wedding',
  vaptisi: 'christening',
  koumparos: 'best man tribute',
  nonos: 'godfather tribute',
  agapi: 'love song',
  afentiko: 'boss tribute',
  mnimosino: 'memorial tribute',
  plaka: 'humorous roast',
  dynamis: 'motivational anthem',
  epeteios: 'anniversary',
  allo: null,
};

/**
 * Tema ocaziei pentru tag-ul de stil, în engleză.
 *
 * `undefined` când nu avem o traducere — apelantul trebuie să NU trimită nimic
 * atunci, în loc să pună identificatorul brut. Un ID necunoscut care arată deja
 * a cuvânt englezesc (ex. `roast`) trece ca atare.
 */
export function occasionThemeEn(occasion: string | null | undefined): string | undefined {
  const key = (occasion ?? '').trim().toLowerCase();
  if (!key) return undefined;
  if (key in OCCASION_EN) return OCCASION_EN[key] ?? undefined;
  // ID necunoscut: îl acceptăm doar dacă e plauzibil un cuvânt englezesc
  // (litere ASCII), ca să nu ajungă la Suno diacritice sau chirilic.
  return /^[a-z][a-z -]{2,30}$/.test(key) ? key : undefined;
}

/**
 * Deschiderea CÂNTATĂ pe care o injectăm când versurile nu pomenesc deja
 * expeditorul și destinatarul (`ensureDedicationOpening`).
 *
 * Spre deosebire de tag-ul de stil, astea sunt versuri — se aud. Erau scrise în
 * română și se injectau pe orice site: o piesă bulgară putea începe cu „De la
 * Калоян, pentru Никола, cu drag". Nu s-a văzut în payload-ul verificat doar
 * fiindcă acolo AI-ul pusese deja numele în `[Spoken Intro]`, deci garda a
 * întors versurile neatinse — adică era o bombă cu întârziere, nu o eroare rară.
 */
export function dedicationOpeningLines(
  locale: string | null | undefined,
  recipient: string,
  dedication: string,
  messageHook: string,
): string[] {
  const l = (locale ?? '').trim().toLowerCase().split('-')[0];
  const hook = messageHook.trim();
  switch (l) {
    case 'bg':
      return [
        `От ${dedication}, за ${recipient}, с обич,`,
        hook ? `${hook}.` : 'Днес е голям ден, сърцето пее с мен.',
      ];
    case 'el':
      return [
        `Από ${dedication}, για ${recipient}, με αγάπη,`,
        hook ? `${hook}.` : 'Σήμερα είναι μεγάλη μέρα, η καρδιά τραγουδά.',
      ];
    case 'ro':
    case '':
      return [
        `De la ${dedication}, pentru ${recipient}, cu drag,`,
        hook ? `${hook}.` : 'Astăzi e o zi mare, vine inima cu mine.',
      ];
    default:
      return [
        `From ${dedication}, for ${recipient}, with love,`,
        hook ? `${hook}.` : 'Today is a big day, my heart sings along.',
      ];
  }
}

/**
 * Scheletul minim de piesă folosit când versurile n-au `[Verse 1]`.
 * „doina" e un ornament specific românesc — pe alte limbi cerem doar acordeon,
 * ca introducerea să nu tragă piesa spre alt gen decât cel al site-ului.
 */
export function introSkeletonTag(locale: string | null | undefined): string {
  const l = (locale ?? '').trim().toLowerCase().split('-')[0];
  return l === 'ro' || !l
    ? '[Intro: oriental synth taksim, accordion doina]'
    : '[Intro: oriental synth taksim, accordion]';
}
