/**
 * Texte pentru emailurile de RECOVERY, per limbă.
 *
 * Până la 31 aug 2026 acest conținut era 100% în română, pe toate site-urile —
 * comentariul din capul lui `recovery.ts` o și declara ca decizie. Confirmat în
 * producție: pe `chalgapodarok.bg` au plecat „🎵 Imaginează-ți fața lui când își
 * aude numele în manea" și „✉️ Ultimul nostru email — codul tău de 30% expiră
 * curând" către clienți bulgari, în aceeași căsuță în care emailurile
 * tranzacționale ajungeau corect traduse.
 *
 * Ca la chat (`modules/chat/chat-i18n.ts`): ro / bg / el traduse, restul pe
 * engleză. Fallback-ul e engleza, nu româna — pe un site grecesc un text
 * românesc se citește ca o eroare, nu ca o limitare.
 */

export type RecoveryLocale = 'ro' | 'bg' | 'el' | 'en';

const KNOWN: ReadonlySet<string> = new Set(['ro', 'bg', 'el']);

export function recoveryLocale(locale: string | null | undefined): RecoveryLocale {
  const l = (locale ?? '').trim().toLowerCase().split('-')[0];
  return (KNOWN.has(l) ? l : 'en') as RecoveryLocale;
}

export interface StageCopy {
  subject: (percent: number) => string;
  headline: (percent: number) => string;
  /** Intro — primește fraza despre melodie și procentul etapei. */
  intro: (songLine: string, percent: number) => string;
  cta: (percent: number) => string;
}

export interface RecoveryStrings {
  hello: string;
  songLineNamed: (nameHtml: string) => string;
  songLineGeneric: string;
  promoLabel: (percent: number) => string;
  promoValid: (hours: number) => string;
  whyReceiving: (site: string) => string;
  unsubQuestion: string;
  unsubLink: string;
  /** Varianta text-only (fără HTML). */
  codeLineText: (percent: number, code: string) => string;
  validTextLine: (hours: number) => string;
  unsubTextLabel: string;
  stages: Record<1 | 2 | 3 | 4 | 5 | 6, StageCopy>;
}

const RO: RecoveryStrings = {
  hello: 'Salut! 👋',
  songLineNamed: (n) => `Maneaua pentru ${n} e gata de configurat și deblocat.`,
  songLineGeneric: 'Ai început să-ți creezi o manea personalizată, dar comanda a rămas neterminată.',
  promoLabel: (p) => `Codul tău · −${p}%`,
  promoValid: (h) => `Valabil ${h} de ore de la primirea acestui email`,
  whyReceiving: (s) => `Primești acest email pentru că ai început o comandă pe ${s}.`,
  unsubQuestion: 'Nu mai vrei să primești emailuri despre comanda ta neterminată?',
  unsubLink: 'Dezabonează-te',
  codeLineText: (p, c) => `Codul tău (−${p}%): ${c}`,
  validTextLine: (h) => `Valabil ${h} de ore de la primirea acestui email.`,
  unsubTextLabel: 'Dezabonare',
  stages: {
    1: {
      subject: () => '🎁 Ai uitat ceva? Maneaua ta te așteaptă (cu o surpriză)',
      headline: () => 'Comanda ta e la un pas distanță',
      intro: (song, pct) =>
        `${song} Ca să-ți fie mai ușor să o termini, ți-am pregătit un cod de reducere de ${pct}% — e doar al tău.`,
      cta: () => 'Continuă comanda',
    },
    2: {
      subject: () => '🎶 Mai e un singur pas până la maneaua ta',
      headline: () => 'Tot ce ai completat e salvat',
      intro: (song, pct) =>
        `${song} Nu trebuie să o iei de la capăt — reiei exact de unde ai rămas. Codul tău de ${pct}% e încă valabil mai jos.`,
      cta: () => 'Reia comanda',
    },
    3: {
      subject: (pct) => `🎁 Reducerea ta a crescut: ${pct}% pentru maneaua ta`,
      headline: () => 'Am mărit reducerea pentru tine',
      intro: (song, pct) =>
        `${song} O manea personalizată e genul de cadou despre care se vorbește ani de zile la mese — și acum te costă cu ${pct}% mai puțin.`,
      cta: (pct) => `Folosește reducerea de ${pct}%`,
    },
    4: {
      subject: (pct) => `⭐ ${pct}% reducere — cea mai mare pe care o putem oferi`,
      headline: (pct) => `${pct}% — mai mult de atât nu putem`,
      intro: (song, pct) =>
        `${song} Ți-am pregătit reducerea maximă: ${pct}%. E cea mai bună ofertă pe care o facem vreodată, păstrată pentru cei care au fost atât de aproape.`,
      cta: (pct) => `Deblochează cu −${pct}%`,
    },
    5: {
      subject: () => '🎵 Imaginează-ți fața lui când își aude numele în manea',
      headline: () => 'Momentul ăla merită trăit',
      intro: (song, pct) =>
        `${song} Gândește-te la momentul în care pornește melodia și toată lumea aude numele lui în versuri. Reducerea ta de ${pct}% e încă activă mai jos.`,
      cta: () => 'Termină maneaua acum',
    },
    6: {
      subject: (pct) => `✉️ Ultimul nostru email — codul tău de ${pct}% expiră curând`,
      headline: () => 'Nu te mai deranjăm după acesta',
      intro: (song, pct) =>
        `${song} Acesta e ultimul email pe care ți-l trimitem despre comanda ta — promitem. Dacă vrei să o termini, codul de ${pct}% de mai jos e încă valabil un timp scurt. Dacă nu, nicio problemă — poate altă dată.`,
      cta: () => 'Folosește ultima reducere',
    },
  },
};

const BG: RecoveryStrings = {
  hello: 'Здравей! 👋',
  songLineNamed: (n) => `Песента за ${n} е готова за настройка и отключване.`,
  songLineGeneric: 'Започна да си създаваш персонализирана песен, но поръчката остана незавършена.',
  promoLabel: (p) => `Твоят код · −${p}%`,
  promoValid: (h) => `Валиден ${h} часа от получаването на този имейл`,
  whyReceiving: (s) => `Получаваш този имейл, защото започна поръчка в ${s}.`,
  unsubQuestion: 'Не искаш повече имейли за незавършената си поръчка?',
  unsubLink: 'Отпиши се',
  codeLineText: (p, c) => `Твоят код (−${p}%): ${c}`,
  validTextLine: (h) => `Валиден ${h} часа от получаването на този имейл.`,
  unsubTextLabel: 'Отписване',
  stages: {
    1: {
      subject: () => '🎁 Забрави ли нещо? Песента ти те чака (с изненада)',
      headline: () => 'Поръчката ти е на една стъпка',
      intro: (song, pct) =>
        `${song} За да ти е по-лесно да я завършиш, ти приготвихме код за отстъпка от ${pct}% — само за теб.`,
      cta: () => 'Продължи поръчката',
    },
    2: {
      subject: () => '🎶 Остава само една стъпка до песента ти',
      headline: () => 'Всичко, което попълни, е запазено',
      intro: (song, pct) =>
        `${song} Не е нужно да започваш отначало — продължаваш точно оттам, докъдето стигна. Кодът ти за ${pct}% е още валиден по-долу.`,
      cta: () => 'Възобнови поръчката',
    },
    3: {
      subject: (pct) => `🎁 Отстъпката ти се увеличи: ${pct}% за песента ти`,
      headline: () => 'Увеличихме отстъпката за теб',
      intro: (song, pct) =>
        `${song} Персонализираната песен е от онези подаръци, за които се говори с години по масите — а сега ти струва с ${pct}% по-малко.`,
      cta: (pct) => `Използвай отстъпката от ${pct}%`,
    },
    4: {
      subject: (pct) => `⭐ ${pct}% отстъпка — най-голямата, която можем да дадем`,
      headline: (pct) => `${pct}% — повече от това не можем`,
      intro: (song, pct) =>
        `${song} Приготвихме ти максималната отстъпка: ${pct}%. Това е най-добрата оферта, която правим изобщо, запазена за онези, които бяха толкова близо.`,
      cta: (pct) => `Отключи с −${pct}%`,
    },
    5: {
      subject: () => '🎵 Представи си лицето му, когато чуе името си в песента',
      headline: () => 'Онзи момент си заслужава',
      intro: (song, pct) =>
        `${song} Помисли за момента, в който песента тръгва и всички чуват името му в текста. Отстъпката ти от ${pct}% е още активна по-долу.`,
      cta: () => 'Завърши песента сега',
    },
    6: {
      subject: (pct) => `✉️ Последният ни имейл — кодът ти за ${pct}% изтича скоро`,
      headline: () => 'След този няма да те безпокоим повече',
      intro: (song, pct) =>
        `${song} Това е последният имейл, който ти изпращаме за поръчката ти — обещаваме. Ако искаш да я завършиш, кодът за ${pct}% по-долу е валиден още малко. Ако не — няма проблем, може би друг път.`,
      cta: () => 'Използвай последната отстъпка',
    },
  },
};

const EL: RecoveryStrings = {
  hello: 'Γεια σου! 👋',
  songLineNamed: (n) => `Το τραγούδι για ${n} είναι έτοιμο για ρύθμιση και ξεκλείδωμα.`,
  songLineGeneric: 'Ξεκίνησες να δημιουργείς ένα προσωποποιημένο τραγούδι, αλλά η παραγγελία έμεινε ημιτελής.',
  promoLabel: (p) => `Ο κωδικός σου · −${p}%`,
  promoValid: (h) => `Ισχύει ${h} ώρες από την παραλαβή αυτού του email`,
  whyReceiving: (s) => `Λαμβάνεις αυτό το email επειδή ξεκίνησες μια παραγγελία στο ${s}.`,
  unsubQuestion: 'Δεν θέλεις άλλο email για την ημιτελή παραγγελία σου;',
  unsubLink: 'Απεγγραφή',
  codeLineText: (p, c) => `Ο κωδικός σου (−${p}%): ${c}`,
  validTextLine: (h) => `Ισχύει ${h} ώρες από την παραλαβή αυτού του email.`,
  unsubTextLabel: 'Απεγγραφή',
  stages: {
    1: {
      subject: () => '🎁 Ξέχασες κάτι; Το τραγούδι σου σε περιμένει (με μια έκπληξη)',
      headline: () => 'Η παραγγελία σου απέχει ένα βήμα',
      intro: (song, pct) =>
        `${song} Για να σου είναι πιο εύκολο να την ολοκληρώσεις, σου ετοιμάσαμε έναν κωδικό έκπτωσης ${pct}% — μόνο για σένα.`,
      cta: () => 'Συνέχισε την παραγγελία',
    },
    2: {
      subject: () => '🎶 Μένει μόνο ένα βήμα για το τραγούδι σου',
      headline: () => 'Ό,τι συμπλήρωσες έχει αποθηκευτεί',
      intro: (song, pct) =>
        `${song} Δεν χρειάζεται να ξεκινήσεις από την αρχή — συνεχίζεις ακριβώς από εκεί που έμεινες. Ο κωδικός σου ${pct}% ισχύει ακόμη παρακάτω.`,
      cta: () => 'Επανάλαβε την παραγγελία',
    },
    3: {
      subject: (pct) => `🎁 Η έκπτωσή σου αυξήθηκε: ${pct}% για το τραγούδι σου`,
      headline: () => 'Αυξήσαμε την έκπτωση για σένα',
      intro: (song, pct) =>
        `${song} Ένα προσωποποιημένο τραγούδι είναι από τα δώρα για τα οποία μιλάνε χρόνια στα τραπέζια — και τώρα σου κοστίζει ${pct}% λιγότερο.`,
      cta: (pct) => `Χρησιμοποίησε την έκπτωση ${pct}%`,
    },
    4: {
      subject: (pct) => `⭐ ${pct}% έκπτωση — η μεγαλύτερη που μπορούμε να δώσουμε`,
      headline: (pct) => `${pct}% — περισσότερο δεν γίνεται`,
      intro: (song, pct) =>
        `${song} Σου ετοιμάσαμε τη μέγιστη έκπτωση: ${pct}%. Είναι η καλύτερη προσφορά που κάνουμε ποτέ, κρατημένη για όσους έφτασαν τόσο κοντά.`,
      cta: (pct) => `Ξεκλείδωσε με −${pct}%`,
    },
    5: {
      subject: () => '🎵 Φαντάσου το πρόσωπό του όταν ακούσει το όνομά του στο τραγούδι',
      headline: () => 'Εκείνη η στιγμή αξίζει',
      intro: (song, pct) =>
        `${song} Σκέψου τη στιγμή που ξεκινά το τραγούδι και όλοι ακούν το όνομά του στους στίχους. Η έκπτωσή σου ${pct}% είναι ακόμη ενεργή παρακάτω.`,
      cta: () => 'Ολοκλήρωσε το τραγούδι τώρα',
    },
    6: {
      subject: (pct) => `✉️ Το τελευταίο μας email — ο κωδικός σου ${pct}% λήγει σύντομα`,
      headline: () => 'Μετά από αυτό δεν θα σε ενοχλήσουμε άλλο',
      intro: (song, pct) =>
        `${song} Αυτό είναι το τελευταίο email που σου στέλνουμε για την παραγγελία σου — το υποσχόμαστε. Αν θέλεις να την ολοκληρώσεις, ο κωδικός ${pct}% παρακάτω ισχύει για λίγο ακόμη. Αν όχι, κανένα πρόβλημα — ίσως κάποια άλλη φορά.`,
      cta: () => 'Χρησιμοποίησε την τελευταία έκπτωση',
    },
  },
};

const EN: RecoveryStrings = {
  hello: 'Hi there! 👋',
  songLineNamed: (n) => `The song for ${n} is ready to be set up and unlocked.`,
  songLineGeneric: 'You started creating a personalised song, but the order was left unfinished.',
  promoLabel: (p) => `Your code · −${p}%`,
  promoValid: (h) => `Valid for ${h} hours from the moment you received this email`,
  whyReceiving: (s) => `You are receiving this email because you started an order on ${s}.`,
  unsubQuestion: 'Do not want emails about your unfinished order any more?',
  unsubLink: 'Unsubscribe',
  codeLineText: (p, c) => `Your code (−${p}%): ${c}`,
  validTextLine: (h) => `Valid for ${h} hours from the moment you received this email.`,
  unsubTextLabel: 'Unsubscribe',
  stages: {
    1: {
      subject: () => '🎁 Forgot something? Your song is waiting (with a surprise)',
      headline: () => 'Your order is one step away',
      intro: (song, pct) =>
        `${song} To make finishing it easier, we prepared a ${pct}% discount code — it is yours alone.`,
      cta: () => 'Continue your order',
    },
    2: {
      subject: () => '🎶 Only one step left to your song',
      headline: () => 'Everything you filled in is saved',
      intro: (song, pct) =>
        `${song} No need to start over — you pick up exactly where you left off. Your ${pct}% code is still valid below.`,
      cta: () => 'Resume your order',
    },
    3: {
      subject: (pct) => `🎁 Your discount went up: ${pct}% for your song`,
      headline: () => 'We increased your discount',
      intro: (song, pct) =>
        `${song} A personalised song is the kind of gift people talk about for years — and now it costs you ${pct}% less.`,
      cta: (pct) => `Use the ${pct}% discount`,
    },
    4: {
      subject: (pct) => `⭐ ${pct}% off — the biggest we can offer`,
      headline: (pct) => `${pct}% — we cannot go further`,
      intro: (song, pct) =>
        `${song} We prepared the maximum discount for you: ${pct}%. It is the best offer we ever make, kept for those who came this close.`,
      cta: (pct) => `Unlock with −${pct}%`,
    },
    5: {
      subject: () => '🎵 Imagine their face when they hear their name in the song',
      headline: () => 'That moment is worth it',
      intro: (song, pct) =>
        `${song} Think of the moment the song starts and everyone hears their name in the lyrics. Your ${pct}% discount is still active below.`,
      cta: () => 'Finish your song now',
    },
    6: {
      subject: (pct) => `✉️ Our last email — your ${pct}% code expires soon`,
      headline: () => 'We will not bother you after this one',
      intro: (song, pct) =>
        `${song} This is the last email we send you about your order — we promise. If you want to finish it, the ${pct}% code below is valid a little longer. If not, no problem — maybe another time.`,
      cta: () => 'Use the last discount',
    },
  },
};

const DICTS: Record<RecoveryLocale, RecoveryStrings> = { ro: RO, bg: BG, el: EL, en: EN };

export function recoveryStrings(locale: string | null | undefined): RecoveryStrings {
  return DICTS[recoveryLocale(locale)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Emailul „colajul tău video e gata" (modules/collage/collage.processor.ts).
// Era singurul email tranzacțional rămas hardcodat în română: restul trec prin
// `i18n/strings.ts`, el se scria direct în processor.
// ─────────────────────────────────────────────────────────────────────────────

export interface CollageReadyStrings {
  subject: string;
  preheader: string;
  title: string;
  forRecipient: (name: string) => string;
  body: string;
  cta: string;
  text: (link: string) => string;
}

const COLLAGE_READY: Record<RecoveryLocale, CollageReadyStrings> = {
  ro: {
    subject: 'Colajul tău video e gata! 🎬',
    preheader: 'Videoclipul cu pozele tale e gata de vizionat.',
    title: 'Colajul tău video e gata!',
    forRecipient: (n) => `Pentru ${n}`,
    body: 'Am montat videoclipul cu pozele tale pe melodie. Deschide pagina melodiei ca să-l vezi și să-l descarci.',
    cta: 'Vezi colajul →',
    text: (link) => `Colajul tău video e gata! Vezi-l aici: ${link}`,
  },
  bg: {
    subject: 'Видео колажът ти е готов! 🎬',
    preheader: 'Видеото със снимките ти е готово за гледане.',
    title: 'Видео колажът ти е готов!',
    forRecipient: (n) => `За ${n}`,
    body: 'Монтирахме видеото със снимките ти върху песента. Отвори страницата на песента, за да го видиш и свалиш.',
    cta: 'Виж колажа →',
    text: (link) => `Видео колажът ти е готов! Виж го тук: ${link}`,
  },
  el: {
    subject: 'Το βίντεο κολάζ σου είναι έτοιμο! 🎬',
    preheader: 'Το βίντεο με τις φωτογραφίες σου είναι έτοιμο για προβολή.',
    title: 'Το βίντεο κολάζ σου είναι έτοιμο!',
    forRecipient: (n) => `Για ${n}`,
    body: 'Μοντάραμε το βίντεο με τις φωτογραφίες σου πάνω στο τραγούδι. Άνοιξε τη σελίδα του τραγουδιού για να το δεις και να το κατεβάσεις.',
    cta: 'Δες το κολάζ →',
    text: (link) => `Το βίντεο κολάζ σου είναι έτοιμο! Δες το εδώ: ${link}`,
  },
  en: {
    subject: 'Your video collage is ready! 🎬',
    preheader: 'The video with your photos is ready to watch.',
    title: 'Your video collage is ready!',
    forRecipient: (n) => `For ${n}`,
    body: 'We put together the video with your photos on the song. Open the song page to watch it and download it.',
    cta: 'See the collage →',
    text: (link) => `Your video collage is ready! Watch it here: ${link}`,
  },
};

export function collageReadyStrings(locale: string | null | undefined): CollageReadyStrings {
  return COLLAGE_READY[recoveryLocale(locale)];
}
