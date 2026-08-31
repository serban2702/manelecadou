/**
 * Texte automate de chat, per limbă.
 *
 * Mesajele pe care le trimite platforma singură (livrarea melodiei, mulțumirea
 * de după, eroarea de generare) erau scrise direct în cod, în română, și plecau
 * ca atare pe TOATE site-urile: pe `chalgapodarok.bg` clientul primea
 * „🎵 Melodia ta e gata!" după ce comandase în bulgară (confirmat în producție,
 * 31 aug 2026 — 12 saluturi românești pe bg, 8 pe el).
 *
 * Doar `ro`, `bg` și `el` sunt traduse — sunt limbile site-urilor reale. Restul
 * cad pe engleză, nu pe română: un text englezesc se citește ca o limitare
 * asumată, unul românesc pe un site grecesc se citește ca o eroare.
 */

export type ChatLocale = 'ro' | 'bg' | 'el' | 'en';

const KNOWN: ReadonlySet<string> = new Set(['ro', 'bg', 'el']);

/** Normalizează `site.locale` la o limbă pentru care avem texte. */
export function chatLocale(locale: string | null | undefined): ChatLocale {
  const l = (locale ?? '').trim().toLowerCase().split('-')[0];
  return (KNOWN.has(l) ? l : 'en') as ChatLocale;
}

/**
 * Limbile în care agentul AI conversațional (Irina) chiar poate purta o discuție.
 * Sursa unică de adevăr — folosită și de cronul de follow-up, care selectează
 * conversații direct din SQL.
 */
export const AI_SUPPORTED_LOCALES: readonly string[] = ['ro'];

/** `true` dacă agentul AI conversațional e disponibil în limba site-ului.
 *  Irina scrie și gândește în română; pe restul limbilor chatul e doar canal
 *  de notificare, iar discuția se mută pe email (vezi `unsupportedLanguage`). */
export function aiChatSupported(locale: string | null | undefined): boolean {
  const l = (locale ?? '').trim().toLowerCase().split('-')[0];
  return AI_SUPPORTED_LOCALES.includes(l);
}

type Dict = {
  songReady: (url: string) => string;
  songReadyRemake: (url: string) => string;
  generationError: string;
  /** Mulțumirea de după livrare. Prima variantă e cea implicită. */
  thankYou: string[];
  thankYouRemake: string;
  thankYouReturning: string[];
  /** Răspunsul dat când clientul scrie pe un site a cărui limbă nu e acoperită. */
  unsupportedLanguage: (email: string) => string;
  /** Varianta fără adresă de email configurată pe site. */
  unsupportedLanguageNoEmail: string;
};

const RO: Dict = {
  songReady: (url) => `🎵 Melodia ta e gata! O poți asculta și descărca aici: ${url}`,
  songReadyRemake: (url) => `🎵 Varianta refăcută e gata! O poți asculta și descărca aici: ${url}`,
  generationError: '⚠️ A apărut o eroare la generarea melodiei. Operatorul nostru se ocupă imediat — te ținem la curent.',
  thankYou: [
    'Mă bucur tare că ți-a ieșit! 🎵 Sper să le placă și celor pentru care e dedicată. Mulțumesc că ne-ai ales! ❤️',
    'Gata, mulțumim mult! ✨ Sper să-i placă tare. Dacă vrei să mai faci una pentru cineva drag, mă găsești aici. 🎶',
    'Mulțumim pentru încredere! 🙏 Aștept să-mi spui cum a reacționat când a auzit-o. ❤️',
    'Felicitări, ai un cadou super! 🎤 Mulțumim că ne-ai dat o șansă să fim parte din momentul ăsta. ❤️',
    'Mă bucur că totul a ieșit cum trebuie! 🎶 Mulțumim mult, ne vedem la următoarea manea! ✨',
  ],
  thankYouRemake:
    'Am refăcut-o cum ai cerut 🙏 Ascultă te rog ULTIMA versiune de pe pagina melodiei (reîncarcă pagina) și spune-mi dacă acum e totul ok.',
  thankYouReturning: [
    'Gata și asta! 🎵 Mulțumesc că te tot întorci la noi, chiar înseamnă mult. Dacă vrei ceva schimbat la ea, zi-mi.',
    'Încă una gata! 🎶 Îmi place că ai prins gustul. Spune-mi dacă vrei să ajustăm ceva.',
    'Livrată! ✨ Mersi că ne ești alături de fiecare dată. Sunt aici dacă mai facem una.',
    'S-a făcut și asta! 🎤 Sper să iasă cadoul perfect. Orice ai nevoie, mă găsești aici.',
  ],
  unsupportedLanguage: (email) =>
    `Îți mulțumim pentru mesaj! 🙏 Chatul nostru nu este deocamdată disponibil în limba ta, așa că nu îți putem răspunde aici. Scrie-ne te rog pe email la ${email} și îți răspundem cât putem de repede.`,
  unsupportedLanguageNoEmail:
    'Îți mulțumim pentru mesaj! 🙏 Chatul nostru nu este deocamdată disponibil în limba ta, așa că nu îți putem răspunde aici. Scrie-ne te rog pe adresa de email din pagina de contact și îți răspundem cât putem de repede.',
};

const BG: Dict = {
  songReady: (url) => `🎵 Песента ти е готова! Можеш да я чуеш и свалиш тук: ${url}`,
  songReadyRemake: (url) => `🎵 Преработената версия е готова! Можеш да я чуеш и свалиш тук: ${url}`,
  generationError:
    '⚠️ Възникна грешка при създаването на песента. Наш оператор вече се занимава с това — ще те държим в течение.',
  thankYou: [
    'Радвам се, че се получи! 🎵 Дано хареса и на този, за когото е. Благодарим, че избра нас! ❤️',
    'Готово, благодарим много! ✨ Дано много ѝ се зарадва. Ако искаш да направиш още една за някой близък, тук съм. 🎶',
    'Благодарим за доверието! 🙏 Пиши ми как реагира, като я чу. ❤️',
    'Поздравления, имаш страхотен подарък! 🎤 Благодарим, че ни даде шанс да сме част от този момент. ❤️',
    'Радвам се, че всичко излезе както трябва! 🎶 Благодарим много, до следващата песен! ✨',
  ],
  thankYouRemake:
    'Преработих я, както поиска 🙏 Моля те, чуй ПОСЛЕДНАТА версия от страницата на песента (презареди страницата) и ми кажи дали сега всичко е наред.',
  thankYouReturning: [
    'Готова и тази! 🎵 Благодаря ти, че се връщаш при нас, наистина означава много. Ако искаш нещо променено, кажи ми.',
    'Още една готова! 🎶 Радвам се, че ти хареса. Кажи ми, ако искаш да настроим нещо.',
    'Доставена! ✨ Благодаря, че си с нас всеки път. Тук съм, ако направим още една.',
    'И тази е готова! 🎤 Дано подаръкът излезе перфектен. За каквото имаш нужда, тук съм.',
  ],
  unsupportedLanguage: (email) =>
    `Благодарим ти за съобщението! 🙏 Чатът ни засега не е наличен на твоя език, затова не можем да ти отговорим тук. Моля, пиши ни на имейл ${email} и ще ти отговорим възможно най-бързо.`,
  unsupportedLanguageNoEmail:
    'Благодарим ти за съобщението! 🙏 Чатът ни засега не е наличен на твоя език, затова не можем да ти отговорим тук. Моля, пиши ни на имейл адреса от страницата за контакт и ще ти отговорим възможно най-бързо.',
};

const EL: Dict = {
  songReady: (url) => `🎵 Το τραγούδι σου είναι έτοιμο! Μπορείς να το ακούσεις και να το κατεβάσεις εδώ: ${url}`,
  songReadyRemake: (url) =>
    `🎵 Η νέα εκδοχή είναι έτοιμη! Μπορείς να την ακούσεις και να την κατεβάσεις εδώ: ${url}`,
  generationError:
    '⚠️ Παρουσιάστηκε σφάλμα κατά τη δημιουργία του τραγουδιού. Ο συνεργάτης μας το αναλαμβάνει αμέσως — θα σε κρατάμε ενήμερο.',
  thankYou: [
    'Χαίρομαι πολύ που βγήκε ωραίο! 🎵 Ελπίζω να αρέσει και σε αυτόν που είναι αφιερωμένο. Ευχαριστούμε που μας επέλεξες! ❤️',
    'Έτοιμο, ευχαριστούμε πολύ! ✨ Ελπίζω να του αρέσει πολύ. Αν θέλεις να φτιάξεις άλλο ένα για κάποιον αγαπημένο, είμαι εδώ. 🎶',
    'Ευχαριστούμε για την εμπιστοσύνη! 🙏 Περιμένω να μου πεις πώς αντέδρασε όταν το άκουσε. ❤️',
    'Συγχαρητήρια, έχεις ένα υπέροχο δώρο! 🎤 Ευχαριστούμε που μας έδωσες την ευκαιρία να είμαστε μέρος αυτής της στιγμής. ❤️',
    'Χαίρομαι που όλα πήγαν καλά! 🎶 Ευχαριστούμε πολύ, τα λέμε στο επόμενο τραγούδι! ✨',
  ],
  thankYouRemake:
    'Το ξαναέφτιαξα όπως ζήτησες 🙏 Άκου σε παρακαλώ την ΤΕΛΕΥΤΑΙΑ εκδοχή από τη σελίδα του τραγουδιού (κάνε ανανέωση) και πες μου αν τώρα είναι όλα εντάξει.',
  thankYouReturning: [
    'Έτοιμο και αυτό! 🎵 Ευχαριστώ που επιστρέφεις σε εμάς, σημαίνει πολλά. Αν θέλεις κάτι αλλαγμένο, πες μου.',
    'Άλλο ένα έτοιμο! 🎶 Χαίρομαι που σου άρεσε. Πες μου αν θέλεις να προσαρμόσουμε κάτι.',
    'Παραδόθηκε! ✨ Ευχαριστώ που είσαι κάθε φορά μαζί μας. Είμαι εδώ αν φτιάξουμε κι άλλο.',
    'Έγινε και αυτό! 🎤 Ελπίζω το δώρο να βγει τέλειο. Ό,τι χρειαστείς, είμαι εδώ.',
  ],
  unsupportedLanguage: (email) =>
    `Σε ευχαριστούμε για το μήνυμα! 🙏 Το chat μας δεν είναι προς το παρόν διαθέσιμο στη γλώσσα σου, οπότε δεν μπορούμε να σου απαντήσουμε εδώ. Στείλε μας παρακαλώ email στο ${email} και θα σου απαντήσουμε το συντομότερο δυνατό.`,
  unsupportedLanguageNoEmail:
    'Σε ευχαριστούμε για το μήνυμα! 🙏 Το chat μας δεν είναι προς το παρόν διαθέσιμο στη γλώσσα σου, οπότε δεν μπορούμε να σου απαντήσουμε εδώ. Στείλε μας παρακαλώ email στη διεύθυνση από τη σελίδα επικοινωνίας και θα σου απαντήσουμε το συντομότερο δυνατό.',
};

const EN: Dict = {
  songReady: (url) => `🎵 Your song is ready! You can listen to it and download it here: ${url}`,
  songReadyRemake: (url) => `🎵 The new version is ready! You can listen to it and download it here: ${url}`,
  generationError:
    '⚠️ Something went wrong while creating your song. Our operator is already on it — we will keep you posted.',
  thankYou: [
    "I'm really glad it turned out well! 🎵 I hope they love it too. Thank you for choosing us! ❤️",
    'All done, thank you so much! ✨ I hope they love it. If you want to make one for someone else, I am here. 🎶',
    'Thank you for your trust! 🙏 Let me know how they reacted when they heard it. ❤️',
    'Congratulations, you have a great gift! 🎤 Thank you for letting us be part of this moment. ❤️',
    'Glad everything turned out right! 🎶 Thank you very much, see you at the next song! ✨',
  ],
  thankYouRemake:
    'I remade it the way you asked 🙏 Please listen to the LATEST version on the song page (reload the page) and tell me if everything is fine now.',
  thankYouReturning: [
    'This one is done too! 🎵 Thank you for coming back to us, it really means a lot. If you want anything changed, tell me.',
    'One more is ready! 🎶 Glad you got a taste for it. Tell me if you want us to adjust anything.',
    'Delivered! ✨ Thanks for being with us every time. I am here if we make another one.',
    'That one is done as well! 🎤 I hope the gift turns out perfect. Whatever you need, I am here.',
  ],
  unsupportedLanguage: (email) =>
    `Thank you for your message! 🙏 Our chat is not available in your language yet, so we cannot reply here. Please email us at ${email} and we will get back to you as soon as we can.`,
  unsupportedLanguageNoEmail:
    'Thank you for your message! 🙏 Our chat is not available in your language yet, so we cannot reply here. Please email us at the address on our contact page and we will get back to you as soon as we can.',
};

const DICTS: Record<ChatLocale, Dict> = { ro: RO, bg: BG, el: EL, en: EN };

export function chatStrings(locale: string | null | undefined): Dict {
  return DICTS[chatLocale(locale)];
}

/**
 * TOATE variantele de mulțumire, în toate limbile.
 *
 * Gărzile anti-duplicat din `sendThankYouAfterGeneration` caută mesajul trimis
 * anterior după conținut (`body: In([...])`). Dacă ar căuta doar în limba
 * curentă, o conversație care a primit mulțumirea în română înainte de această
 * versiune ar scăpa de gardă și clientul ar primi a doua mulțumire, în altă
 * limbă. Uniunea acoperă și istoricul.
 */
export function allThankYouBodies(): string[] {
  const out: string[] = [];
  for (const d of Object.values(DICTS)) {
    out.push(...d.thankYou, ...d.thankYouReturning, d.thankYouRemake);
  }
  return out;
}

/** Variantele de „client care revine" din toate limbile (idem, pentru gărzi). */
export function allReturningBodies(): string[] {
  const out: string[] = [];
  for (const d of Object.values(DICTS)) out.push(...d.thankYouReturning);
  return out;
}
