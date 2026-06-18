/**
 * Inferare gen cumpărător din numele Stripe (customer_details.name).
 *
 * Numele de pe card poate fi „Prenume Nume" sau „Nume Prenume", cu sau fără
 * diacritice. Strategia, în ordinea încrederii:
 *   1. Caută orice token într-un dicționar de prenume RO comune (M/F) → cel mai sigur.
 *   2. Fallback euristic pe terminație: prenumele feminine RO se termină covârșitor
 *      în „-a"; aplicăm doar dacă terminația e clară și nu e o excepție masculină.
 *   3. Dacă rămâne ambiguu → `null` (preferăm „necunoscut" în loc de greșit).
 *
 * Acoperirea reală e raportată după backfill (vezi /admin/analytics endpoints).
 */

const MALE_NAMES = new Set<string>([
  'ion', 'ioan', 'gheorghe', 'george', 'gigi', 'vasile', 'nicolae', 'nicu', 'nicusor',
  'constantin', 'costel', 'costin', 'dumitru', 'dumitru', 'mitica', 'andrei', 'mihai',
  'mihail', 'alexandru', 'alex', 'sandu', 'cristian', 'cristi', 'marian', 'marius',
  'florin', 'florinel', 'daniel', 'dan', 'danut', 'gabriel', 'gabi', 'adrian', 'adi',
  'catalin', 'cata', 'ciprian', 'cipri', 'valentin', 'vali', 'sorin', 'sebastian', 'sebi',
  'razvan', 'bogdan', 'bogdy', 'ionut', 'ionel', 'vlad', 'vladut', 'radu', 'paul', 'petru',
  'petre', 'pavel', 'stefan', 'fane', 'tudor', 'teodor', 'victor', 'viorel', 'eugen',
  'emil', 'emanuel', 'iulian', 'iuliu', 'octavian', 'ovidiu', 'lucian', 'laurentiu',
  'liviu', 'mircea', 'mugur', 'silviu', 'traian', 'cornel', 'corneliu', 'aurel', 'aurelian',
  'doru', 'dorin', 'gelu', 'horia', 'horatiu', 'ilie', 'iosif', 'leonard', 'lenuta',
  'marcel', 'maximilian', 'narcis', 'nelu', 'remus', 'robert', 'roberto', 'samuel',
  'sergiu', 'toma', 'valeriu', 'virgil', 'cosmin', 'darius', 'denis', 'edward', 'eduard',
  'fabian', 'ferdinand', 'flavius', 'gheorghita', 'grigore', 'iancu', 'iacob', 'matei',
  'david', 'darian', 'rares', 'andy', 'claudiu', 'cezar', 'doru', 'fabio', 'george',
  'mihnea', 'leon', 'luca', 'lucas', 'maxim', 'patrick', 'tiberiu', 'titi', 'mircea',
  'aurica', 'ticu', 'gicu', 'puiu', 'relu', 'sile', 'tavi', 'beniamin', 'cristinel',
  'ghita', 'iulius', 'nicholas', 'william', 'rauer', 'iustin', 'gigel',
  // prenume de bază foarte frecvente (apar des în emailuri prenume.nume)
  'florin', 'marin', 'costica', 'gheorghita', 'vasilica', 'nelu', 'gigi', 'gaby',
  'georgel', 'ionica', 'luci', 'mihaita', 'sorinel', 'valentino', 'romeo', 'denis',
  'dragos', 'razvan', 'alin', 'codrut', 'cristi', 'edi', 'fanel', 'florian', 'georgian',
  'iuli', 'madalin', 'manu', 'marcelo', 'ovi', 'petrisor', 'robi', 'sergi', 'teo', 'vali',
]);

const FEMALE_NAMES = new Set<string>([
  'maria', 'ioana', 'elena', 'ana', 'ana-maria', 'andreea', 'andrea', 'gabriela', 'gabi',
  'mihaela', 'cristina', 'cristiana', 'daniela', 'dana', 'alexandra', 'alina', 'adriana',
  'florentina', 'florina', 'mariana', 'marinela', 'roxana', 'raluca', 'ramona', 'simona',
  'sorina', 'monica', 'nicoleta', 'nicolina', 'oana', 'olga', 'ortansa', 'paula', 'paraschiva',
  'petronela', 'iulia', 'iuliana', 'georgiana', 'georgeta', 'corina', 'carmen', 'catalina',
  'camelia', 'claudia', 'cosmina', 'denisa', 'diana', 'doina', 'dorina', 'ecaterina',
  'emilia', 'eugenia', 'felicia', 'gianina', 'ileana', 'ionela', 'irina', 'isabela',
  'lacramioara', 'larisa', 'laura', 'lavinia', 'lenuta', 'liliana', 'livia', 'loredana',
  'luminita', 'magda', 'magdalena', 'manuela', 'marcela', 'margareta', 'marioara', 'melania',
  'mirela', 'narcisa', 'natalia', 'otilia', 'rodica', 'rozalia', 'sanda', 'silvia', 'sofia',
  'stefania', 'steluta', 'tatiana', 'teodora', 'valentina', 'valeria', 'vasilica', 'veronica',
  'victoria', 'violeta', 'viorica', 'virginia', 'aurelia', 'aurora', 'beatrice', 'bianca',
  'bogdana', 'carla', 'carmina', 'cerasela', 'crina', 'delia', 'dorothea', 'estera',
  'gina', 'ingrid', 'ionica', 'jana', 'jenica', 'julia', 'karina', 'lidia', 'ligia',
  'lucia', 'luiza', 'madalina', 'maricica', 'marilena', 'marta', 'miruna', 'nadia',
  'natasa', 'nuta', 'olimpia', 'patricia', 'pompilia', 'profira', 'reta', 'sabina',
  'sevastita', 'tania', 'tincuta', 'tudorita', 'zamfira', 'zoe', 'antonia', 'ariana',
  'briana', 'casiana', 'daria', 'eliza', 'elisabeta', 'evelina', 'iasmina', 'maia',
  'malina', 'rebeca', 'sara', 'sarah', 'sofia', 'stela', 'anca', 'aida', 'amalia',
  'anisoara', 'costica', 'cati', 'lili', 'mimi', 'tanti', 'gana',
]);

/** Excepții: prenume masculine care se termină în „-a" (euristica le-ar marca greșit F). */
const MALE_A_ENDING = new Set<string>([
  'luca', 'toma', 'mircea', 'horia', 'costea', 'aurica', 'ticu', 'gicu', 'nica',
  'oprea', 'dragomira', 'costica', 'gheorghita', 'dumitra', 'neculcea', 'badea', 'voicu',
]);

function stripDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ăâ]/g, 'a')
    .replace(/[î]/g, 'i')
    .replace(/[șş]/g, 's')
    .replace(/[țţ]/g, 't');
}

function tokenize(name: string): string[] {
  return stripDiacritics(name.toLowerCase())
    .replace(/[^a-z\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/**
 * Inferă genul ('M' | 'F') din numele complet, sau null dacă e ambiguu/necunoscut.
 */
export function inferGenderFromName(name: string | null | undefined): 'M' | 'F' | null {
  if (!name || typeof name !== 'string') return null;
  const tokens = tokenize(name);
  if (tokens.length === 0) return null;

  // 1. Dicționar — primul token recunoscut câștigă (prenumele e de obicei distinctiv).
  for (const t of tokens) {
    if (FEMALE_NAMES.has(t)) return 'F';
    if (MALE_NAMES.has(t)) return 'M';
  }

  // 2. Fallback euristic pe terminație, aplicat tokenului cel mai „prenume-like".
  //    Prenumele feminine RO se termină în „-a"/„-ia"/„-ea". Aplicăm doar dacă vreun
  //    token are terminație feminină clară și nu e o excepție masculină.
  for (const t of tokens) {
    if (MALE_A_ENDING.has(t)) continue;
    if (/(?:a|ia|ea)$/.test(t) && t.length >= 4) return 'F';
  }

  return null;
}

/**
 * Pentru tokeni cu prenume + nume LIPITE (tipic în emailuri: „iondumitrascu",
 * „mariacrudu", „florinpian"), găsește cel mai LUNG prenume cunoscut care e
 * prefix al tokenului. Cel mai lung câștigă → rezolvă corect perechile unde forma
 * masculină e prefix al celei feminine (daniel/daniela, ionel/ionela): dacă tokenul
 * continuă cu „-a", match-ul lung e forma feminină, ceea ce e de obicei corect.
 * Folosit DOAR pe emailuri (nu pe numele Stripe), ca să nu greșim pe nume de familie.
 */
function genderByPrefix(token: string): 'M' | 'F' | null {
  if (token.length < 5) return null;
  let bestLen = 0;
  let bestG: 'M' | 'F' | null = null;
  for (const name of FEMALE_NAMES) {
    if (name.length >= 3 && name.length > bestLen && token.startsWith(name)) {
      bestLen = name.length;
      bestG = 'F';
    }
  }
  for (const name of MALE_NAMES) {
    if (name.length >= 3 && name.length > bestLen && token.startsWith(name)) {
      bestLen = name.length;
      bestG = 'M';
    }
  }
  return bestG;
}

/**
 * Variantă pentru pattern-ul invers „nume+prenume" lipit („parvugheorghe",
 * „padurarubogdan", „zecherurobert"). Cel mai lung prenume cunoscut care e SUFIX.
 * Prag ≥4 litere (mai conservator decât prefixul) ca să nu prindă terminații
 * accidentale de nume de familie.
 */
function genderBySuffix(token: string): 'M' | 'F' | null {
  if (token.length < 6) return null;
  let bestLen = 0;
  let bestG: 'M' | 'F' | null = null;
  for (const name of FEMALE_NAMES) {
    if (name.length >= 4 && name.length > bestLen && token.length > name.length && token.endsWith(name)) {
      bestLen = name.length;
      bestG = 'F';
    }
  }
  for (const name of MALE_NAMES) {
    if (name.length >= 4 && name.length > bestLen && token.length > name.length && token.endsWith(name)) {
      bestLen = name.length;
      bestG = 'M';
    }
  }
  return bestG;
}

/** Emailuri interne / de test — nu reprezintă clienți reali, nu inferăm gen din ele. */
export function isInternalEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase().trim();
  return (
    e.startsWith('serban2702@') ||
    e.endsWith('@manelecadou.ro') ||
    e.endsWith('@chalgapodarok.bg') ||
    e.endsWith('@doroparaggelia.gr') ||
    e.endsWith('@example.com') ||
    e.endsWith('@test.com')
  );
}

/**
 * Inferă genul din partea locală a unui email (prenume.nume@, prenume_nume@,
 * prenume123@). Refolosește dicționarul + euristica pe tokenii din local-part.
 * Returnează null pentru emailuri interne/de test sau când e ambiguu.
 */
export function inferGenderFromEmail(email: string | null | undefined): 'M' | 'F' | null {
  if (!email || isInternalEmail(email)) return null;
  const local = email.split('@')[0];
  if (!local) return null;
  // Pas 1: dicționar + terminație pe tokenii separați (maria.popescu, robert_x).
  const direct = inferGenderFromName(local);
  if (direct) return direct;
  // Pas 2: prenume + nume lipite (iondumitrascu, florinpian) → prefix matching.
  const tokens = tokenize(local);
  for (const t of tokens) {
    const g = genderByPrefix(t);
    if (g) return g;
  }
  // Pas 3: nume + prenume lipite (parvugheorghe, zecherurobert) → suffix matching.
  for (const t of tokens) {
    const g = genderBySuffix(t);
    if (g) return g;
  }
  return null;
}

/**
 * Inferă genul CUMPĂRĂTORULUI din toate sursele disponibile, în ordinea încrederii:
 * numele Stripe → prefixul emailului. Folosit la webhook, la checkout și la backfill.
 */
export function inferBuyerGender(opts: {
  name?: string | null;
  email?: string | null;
}): 'M' | 'F' | null {
  return inferGenderFromName(opts.name) ?? inferGenderFromEmail(opts.email);
}
