/**
 * Mici dicționare per limbă pentru email-uri tranzacționale.
 * Doar frazele care apar în subject/body — restul e structură HTML.
 */

export type EmailLocale = 'ro' | 'bg' | 'sr' | 'tr' | 'el' | 'hr' | 'sl' | 'bs';

type Dict = {
  footer: {
    company: string;
    termsLink: string;
    privacyLink: string;
    contactLink: string;
    receivedBecause: string;
  };
  magicLink: {
    subject: string;
    title: string;
    intro: (ttl: number) => string;
    button: string;
    or: string;
    fallback: string;
    text: (url: string, ttl: number) => string;
  };
  generationReady: {
    subject: (name: string) => string;
    titleDemo: string;
    titleFull: string;
    forRecipient: (name: string) => string;
    listenButton: string;
    download: string;
    promoTitle: string;
    promoBody: string;
    promoLink: string;
    aiNote: string;
    text: (kind: string, name: string, link: string) => string;
  };
  paymentSuccess: {
    subject: (amount: string, currency: string) => string;
    title: string;
    intro: (name: string) => string;
    rowTotal: string;
    rowSong: string;
    songValue: string;
    listenButton: string;
    invoiceNote: string;
    text: (amount: string, currency: string, link: string) => string;
  };
  giftCode: {
    subject: (code: string) => string;
    title: string;
    yourCode: string;
    package: string;
    validUntil: string;
    body: string;
    button: string;
    text: (code: string, until: string, url: string) => string;
  };
  giftTiers: {
    single: string;
    pack3: string;
    pack10: string;
  };
  /** Cod de localizare pentru `Date.toLocaleDateString(...)` (ex. 'ro-RO', 'bg-BG'). */
  dateLocale: string;
  gdpr: {
    subject: (action: string, email: string) => string;
    title: (action: string) => string;
    intro: (action: string) => string;
    email: string;
    userId: string;
    type: string;
    reason: string;
    note: string;
    actionExport: string;
    actionDelete: string;
    text: (action: string, email: string, id: string, type: string, reason?: string) => string;
  };
};

const RO: Dict = {
  footer: {
    company: '© 2026 Manele Cadou SRL · CUI 4123456 · J40/1234/2024',
    termsLink: 'Termeni',
    privacyLink: 'Confidențialitate',
    contactLink: 'Contact',
    receivedBecause: 'Ai primit acest email pentru că folosești Manele Cadou. Pentru a nu mai primi, scrie-ne la {contact}.',
  },
  magicLink: {
    subject: 'Intră în contul tău Manele Cadou 👑',
    title: 'Intră în cont',
    intro: (ttl) => `Salut! Apasă butonul de mai jos să te loghezi în contul tău. Link-ul e valid <b>${ttl} minute</b>.`,
    button: '👑 Intră în cont',
    or: 'Sau copiază manual:',
    fallback: 'Dacă n-ai cerut tu link-ul, ignoră emailul — nu se va întâmpla nimic.',
    text: (url, ttl) => `Apasă link-ul ca să te loghezi (valid ${ttl} min): ${url}`,
  },
  generationReady: {
    subject: (name) => `🎤 Maneaua ta pentru ${name} e gata!`,
    titleDemo: 'Maneaua ta demo (30s) e gata!',
    titleFull: 'Maneaua ta completă (90s) e gata!',
    forRecipient: (name) => `Pentru <b>${name}</b> · 2 versiuni audio`,
    listenButton: '🎧 Ascultă maneaua',
    download: 'Sau download direct: {link}',
    promoTitle: '🎁 Oferta 1+1 GRATIS',
    promoBody: 'Demo-ul are 30s. Pentru manea completă (90s × 2 versiuni) — {link}. Plată unică, fără abonament.',
    promoLink: 'deblochează aici',
    aiNote: 'Maneaua a fost generată cu AI. Vocea e fictivă, parodică.',
    text: (kind, name, link) => `Maneaua ta ${kind} pentru ${name} e gata: ${link}`,
  },
  paymentSuccess: {
    subject: (amount, currency) => `✓ Plata confirmată — ${amount} ${currency}`,
    title: '✓ Plată confirmată',
    intro: (name) => `Mulțumim! Manea completă pentru <b>${name}</b> e deblocată.`,
    rowTotal: 'Total plătit',
    rowSong: 'Manea',
    songValue: '90s × 2 versiuni',
    listenButton: '🎧 Ascultă maneaua completă',
    invoiceNote: 'Factura fiscală o vei primi separat în următoarele 24h.',
    text: (amount, currency, link) => `Plata ${amount} ${currency} confirmată. Maneaua: ${link}`,
  },
  giftCode: {
    subject: (code) => `🎁 Codul tău cadou Manele Cadou — ${code}`,
    title: 'Codul tău cadou e gata!',
    yourCode: 'Codul tău cadou',
    package: 'Pachet',
    validUntil: 'valabil până la',
    body: 'Trimite codul către cine vrei — prin SMS, WhatsApp, email. Persoana care îl primește îl introduce pe site la pasul de plată.',
    button: '🎤 Folosește codul acum',
    text: (code, until, url) => `Cod cadou: ${code} (valabil până la ${until}). Folosește la ${url}`,
  },
  gdpr: {
    subject: (action, email) => `[GDPR] ${action} — ${email}`,
    title: (action) => `⚖️ Cerere GDPR — ${action}`,
    intro: (action) => `Un user a cerut <b>${action.toLowerCase()}</b> prin pagina /cont.`,
    email: 'Email:',
    userId: 'User ID:',
    type: 'Tip cerere:',
    reason: 'Motiv:',
    note: 'Procesează manual conform GDPR (max 30 zile). Răspunde user-ului cu detaliile cerinței.',
    actionExport: 'Export date',
    actionDelete: 'Ștergere cont',
    text: (action, email, id, type, reason) =>
      `Cerere GDPR ${action} de la ${email} (${id}). Tip: ${type}.${reason ? ' Motiv: ' + reason : ''}`,
  },
  giftTiers: { single: '1 manea', pack3: '3 manele', pack10: '10 manele' },
  dateLocale: 'ro-RO',
};

// Pentru celelalte limbi păstrăm fallback la RO până la traducerea email-urilor;
// userii primesc emailul în RO, dar adresat corect (numele apare ca atare).
// Înlocuim câmpurile cu traduceri reale când scoatem din MVP.
const FALLBACK = RO;

const BG: Dict = {
  ...RO,
  footer: {
    company: '© 2026 Manele Cadou SRL · ЕИК 4123456 · J40/1234/2024',
    termsLink: 'Условия',
    privacyLink: 'Поверителност',
    contactLink: 'Контакт',
    receivedBecause: 'Получи този имейл, защото използваш Manele Cadou. За отписване, пиши ни на {contact}.',
  },
  magicLink: {
    subject: 'Влез в профила си Manele Cadou 👑',
    title: 'Влез в профила',
    intro: (ttl) => `Здравей! Натисни бутона по-долу за да влезеш. Линкът е валиден <b>${ttl} минути</b>.`,
    button: '👑 Влез в профила',
    or: 'Или копирай ръчно:',
    fallback: 'Ако не си заявил линка, игнорирай имейла — нищо няма да се случи.',
    text: (url, ttl) => `Натисни линка за вход (валиден ${ttl} мин): ${url}`,
  },
  generationReady: {
    subject: (name) => `🎤 Манелето ти за ${name} е готово!`,
    titleDemo: 'Твоето демо (30 сек) е готово!',
    titleFull: 'Твоето пълно манеле (90 сек) е готово!',
    forRecipient: (name) => `За <b>${name}</b> · 2 аудио версии`,
    listenButton: '🎧 Чуй манелето',
    download: 'Или директно сваляне: {link}',
    promoTitle: '🎁 Оферта 1+1 БЕЗПЛАТНО',
    promoBody: 'Демото е 30 сек. За пълно манеле (90 сек × 2 версии) — {link}. Еднократно плащане, без абонамент.',
    promoLink: 'отключи тук',
    aiNote: 'Манелето е генерирано с AI. Гласът е измислен, пародиен.',
    text: (kind, name, link) => `Твоето ${kind} манеле за ${name} е готово: ${link}`,
  },
  paymentSuccess: {
    subject: (amount, currency) => `✓ Плащането е потвърдено — ${amount} ${currency}`,
    title: '✓ Плащане потвърдено',
    intro: (name) => `Благодарим! Пълното манеле за <b>${name}</b> е отключено.`,
    rowTotal: 'Платена сума',
    rowSong: 'Манеле',
    songValue: '90 сек × 2 версии',
    listenButton: '🎧 Чуй пълното манеле',
    invoiceNote: 'Данъчната фактура ще получиш отделно в следващите 24 часа.',
    text: (amount, currency, link) => `Плащане ${amount} ${currency} потвърдено. Манеле: ${link}`,
  },
  giftCode: {
    subject: (code) => `🎁 Твоят подаръчен код Manele Cadou — ${code}`,
    title: 'Подаръчният ти код е готов!',
    yourCode: 'Твоят подаръчен код',
    package: 'Пакет',
    validUntil: 'валиден до',
    body: 'Изпрати кода на когото искаш — чрез SMS, WhatsApp, имейл. Получателят го въвежда на сайта при плащане.',
    button: '🎤 Използвай кода сега',
    text: (code, until, url) => `Подаръчен код: ${code} (валиден до ${until}). Използвай на ${url}`,
  },
  gdpr: RO.gdpr,
  giftTiers: { single: '1 манеле', pack3: '3 манелета', pack10: '10 манелета' },
  dateLocale: 'bg-BG',
};

const TR: Dict = {
  ...RO,
  footer: {
    company: '© 2026 Manele Cadou SRL · CUI 4123456 · J40/1234/2024',
    termsLink: 'Şartlar',
    privacyLink: 'Gizlilik',
    contactLink: 'İletişim',
    receivedBecause: 'Bu e-postayı Manele Cadou kullandığın için aldın. Çıkmak için {contact} adresine yaz.',
  },
  magicLink: {
    subject: 'Manele Cadou hesabına giriş 👑',
    title: 'Hesabına gir',
    intro: (ttl) => `Selam! Aşağıdaki butona basarak hesabına giriş yap. Bağlantı <b>${ttl} dakika</b> geçerli.`,
    button: '👑 Hesaba gir',
    or: 'Ya da elle kopyala:',
    fallback: 'Bağlantıyı sen istemediysen e-postayı yok say — bir şey olmaz.',
    text: (url, ttl) => `Giriş bağlantısı (${ttl} dk geçerli): ${url}`,
  },
  generationReady: {
    subject: (name) => `🎤 ${name} için şarkın hazır!`,
    titleDemo: 'Demo şarkın (30 sn) hazır!',
    titleFull: 'Tam şarkın (90 sn) hazır!',
    forRecipient: (name) => `<b>${name}</b> için · 2 ses versiyonu`,
    listenButton: '🎧 Şarkıyı dinle',
    download: 'Ya da doğrudan indir: {link}',
    promoTitle: '🎁 1+1 BEDAVA',
    promoBody: 'Demo 30 sn. Tam şarkı (90 sn × 2 versiyon) için — {link}. Tek seferlik ödeme.',
    promoLink: 'buradan aç',
    aiNote: 'Şarkı AI ile üretildi. Ses kurgusal, parodi.',
    text: (kind, name, link) => `${name} için ${kind} şarkın hazır: ${link}`,
  },
  paymentSuccess: {
    subject: (amount, currency) => `✓ Ödeme onaylandı — ${amount} ${currency}`,
    title: '✓ Ödeme onaylandı',
    intro: (name) => `Teşekkürler! <b>${name}</b> için tam şarkı açıldı.`,
    rowTotal: 'Ödenen toplam',
    rowSong: 'Şarkı',
    songValue: '90 sn × 2 versiyon',
    listenButton: '🎧 Tam şarkıyı dinle',
    invoiceNote: 'Fatura 24 saat içinde ayrı bir e-postayla gelir.',
    text: (amount, currency, link) => `${amount} ${currency} ödemesi onaylandı. Şarkı: ${link}`,
  },
  giftCode: {
    subject: (code) => `🎁 Manele Cadou hediye kodun — ${code}`,
    title: 'Hediye kodun hazır!',
    yourCode: 'Hediye kodun',
    package: 'Paket',
    validUntil: 'son kullanma',
    body: 'Kodu istediğine gönder — SMS, WhatsApp, e-posta. Alan kişi siteye ödeme adımında girer.',
    button: '🎤 Kodu kullan',
    text: (code, until, url) => `Hediye kodu: ${code} (${until} tarihine kadar). Kullanım: ${url}`,
  },
  gdpr: RO.gdpr,
  giftTiers: { single: '1 şarkı', pack3: '3 şarkı', pack10: '10 şarkı' },
  dateLocale: 'tr-TR',
};

const EL: Dict = {
  ...RO,
  footer: {
    company: '© 2026 Manele Cadou SRL · CUI 4123456 · J40/1234/2024',
    termsLink: 'Όροι',
    privacyLink: 'Απόρρητο',
    contactLink: 'Επικοινωνία',
    receivedBecause: 'Έλαβες αυτό το email επειδή χρησιμοποιείς το Manele Cadou. Για διαγραφή, γράψε στο {contact}.',
  },
  magicLink: {
    subject: 'Είσοδος στον λογαριασμό σου Manele Cadou 👑',
    title: 'Είσοδος στον λογαριασμό',
    intro: (ttl) => `Γεια! Πάτα το κουμπί παρακάτω για να συνδεθείς. Ο σύνδεσμος ισχύει <b>${ttl} λεπτά</b>.`,
    button: '👑 Σύνδεση',
    or: 'Ή αντίγραψε χειροκίνητα:',
    fallback: 'Αν δεν ζήτησες εσύ τον σύνδεσμο, αγνόησε το email — δεν θα γίνει τίποτα.',
    text: (url, ttl) => `Σύνδεσμος εισόδου (ισχύει ${ttl} λεπτά): ${url}`,
  },
  generationReady: {
    subject: (name) => `🎤 Το τραγούδι για ${name} είναι έτοιμο!`,
    titleDemo: 'Το demo τραγούδι σου (30 δευτ.) είναι έτοιμο!',
    titleFull: 'Το πλήρες τραγούδι σου (90 δευτ.) είναι έτοιμο!',
    forRecipient: (name) => `Για τον/την <b>${name}</b> · 2 εκδόσεις ήχου`,
    listenButton: '🎧 Άκου το τραγούδι',
    download: 'Ή κατέβασε άμεσα: {link}',
    promoTitle: '🎁 1+1 ΔΩΡΕΑΝ',
    promoBody: 'Το demo είναι 30 δευτ. Για πλήρες τραγούδι (90 δευτ. × 2 εκδόσεις) — {link}. Εφάπαξ πληρωμή.',
    promoLink: 'ξεκλείδωσε εδώ',
    aiNote: 'Το τραγούδι δημιουργήθηκε με AI. Η φωνή είναι φανταστική, παρωδική.',
    text: (kind, name, link) => `Το ${kind} τραγούδι σου για ${name} είναι έτοιμο: ${link}`,
  },
  paymentSuccess: {
    subject: (amount, currency) => `✓ Πληρωμή επιβεβαιώθηκε — ${amount} ${currency}`,
    title: '✓ Πληρωμή επιβεβαιώθηκε',
    intro: (name) => `Ευχαριστούμε! Το πλήρες τραγούδι για τον/την <b>${name}</b> ξεκλείδωσε.`,
    rowTotal: 'Σύνολο',
    rowSong: 'Τραγούδι',
    songValue: '90 δευτ. × 2 εκδόσεις',
    listenButton: '🎧 Άκου το πλήρες τραγούδι',
    invoiceNote: 'Το τιμολόγιο θα έρθει χωριστά μέσα σε 24 ώρες.',
    text: (amount, currency, link) => `Πληρωμή ${amount} ${currency} επιβεβαιώθηκε. Τραγούδι: ${link}`,
  },
  giftCode: {
    subject: (code) => `🎁 Ο κωδικός δώρου σου Manele Cadou — ${code}`,
    title: 'Ο κωδικός δώρου σου είναι έτοιμος!',
    yourCode: 'Κωδικός δώρου',
    package: 'Πακέτο',
    validUntil: 'ισχύει έως',
    body: 'Στείλε τον κωδικό σε όποιον θέλεις — SMS, WhatsApp, email. Ο παραλήπτης τον εισάγει στην ιστοσελίδα στο βήμα της πληρωμής.',
    button: '🎤 Χρησιμοποίησε τον κωδικό',
    text: (code, until, url) => `Κωδικός δώρου: ${code} (έως ${until}). Χρήση στο ${url}`,
  },
  gdpr: RO.gdpr,
  giftTiers: { single: '1 τραγούδι', pack3: '3 τραγούδια', pack10: '10 τραγούδια' },
  dateLocale: 'el-GR',
};

const SR: Dict = {
  ...RO,
  footer: {
    company: '© 2026 Manele Cadou SRL · CUI 4123456 · J40/1234/2024',
    termsLink: 'Uslovi',
    privacyLink: 'Privatnost',
    contactLink: 'Kontakt',
    receivedBecause: 'Dobio si ovaj mejl jer koristiš Manele Cadou. Za odjavu, piši na {contact}.',
  },
  magicLink: {
    subject: 'Prijava u nalog Manele Cadou 👑',
    title: 'Prijava u nalog',
    intro: (ttl) => `Zdravo! Pritisni dugme ispod za prijavu. Link važi <b>${ttl} minuta</b>.`,
    button: '👑 Prijavi se',
    or: 'Ili kopiraj ručno:',
    fallback: 'Ako nisi tražio link, ignoriši mejl — ništa se neće desiti.',
    text: (url, ttl) => `Link za prijavu (važi ${ttl} min): ${url}`,
  },
  generationReady: {
    subject: (name) => `🎤 Pesma za ${name} je gotova!`,
    titleDemo: 'Tvoj demo (30 sek) je gotov!',
    titleFull: 'Tvoja puna pesma (90 sek) je gotova!',
    forRecipient: (name) => `Za <b>${name}</b> · 2 verzije`,
    listenButton: '🎧 Slušaj pesmu',
    download: 'Ili direktan download: {link}',
    promoTitle: '🎁 1+1 GRATIS',
    promoBody: 'Demo je 30 sek. Za punu pesmu (90 sek × 2 verzije) — {link}. Jednokratno plaćanje.',
    promoLink: 'otključaj ovde',
    aiNote: 'Pesma je generisana sa AI. Glas je izmišljen, parodijski.',
    text: (kind, name, link) => `Tvoja ${kind} pesma za ${name} je gotova: ${link}`,
  },
  paymentSuccess: {
    subject: (amount, currency) => `✓ Plaćanje potvrđeno — ${amount} ${currency}`,
    title: '✓ Plaćanje potvrđeno',
    intro: (name) => `Hvala! Puna pesma za <b>${name}</b> je otključana.`,
    rowTotal: 'Ukupno plaćeno',
    rowSong: 'Pesma',
    songValue: '90 sek × 2 verzije',
    listenButton: '🎧 Slušaj punu pesmu',
    invoiceNote: 'Račun stiže odvojeno u narednih 24h.',
    text: (amount, currency, link) => `Plaćanje ${amount} ${currency} potvrđeno. Pesma: ${link}`,
  },
  giftCode: {
    subject: (code) => `🎁 Tvoj poklon kod Manele Cadou — ${code}`,
    title: 'Poklon kod je spreman!',
    yourCode: 'Poklon kod',
    package: 'Paket',
    validUntil: 'važi do',
    body: 'Pošalji kod kome god želiš — SMS, WhatsApp, mejl. Primalac ga unese na sajtu u koraku plaćanja.',
    button: '🎤 Iskoristi kod',
    text: (code, until, url) => `Poklon kod: ${code} (važi do ${until}). Iskoristi na ${url}`,
  },
  gdpr: RO.gdpr,
  giftTiers: { single: '1 pesma', pack3: '3 pesme', pack10: '10 pesama' },
  dateLocale: 'sr-RS',
};

const HR: Dict = {
  ...SR,
  footer: { ...SR.footer, termsLink: 'Uvjeti', privacyLink: 'Privatnost', contactLink: 'Kontakt' },
  giftTiers: { single: '1 pjesma', pack3: '3 pjesme', pack10: '10 pjesama' },
  dateLocale: 'hr-HR',
};
const SL: Dict = {
  ...RO,
  footer: {
    company: '© 2026 Manele Cadou SRL · CUI 4123456 · J40/1234/2024',
    termsLink: 'Pogoji',
    privacyLink: 'Zasebnost',
    contactLink: 'Kontakt',
    receivedBecause: 'Prejel si ta mail, ker uporabljaš Manele Cadou. Za odjavo piši na {contact}.',
  },
  magicLink: {
    subject: 'Prijava v račun Manele Cadou 👑',
    title: 'Prijava v račun',
    intro: (ttl) => `Pozdravljen! Pritisni gumb spodaj za prijavo. Povezava velja <b>${ttl} minut</b>.`,
    button: '👑 Prijava',
    or: 'Ali ročno kopiraj:',
    fallback: 'Če nisi zahteval povezave, ignoriraj mail — nič se ne bo zgodilo.',
    text: (url, ttl) => `Povezava za prijavo (velja ${ttl} min): ${url}`,
  },
  generationReady: SR.generationReady,
  paymentSuccess: SR.paymentSuccess,
  giftCode: SR.giftCode,
  gdpr: RO.gdpr,
  giftTiers: { single: '1 pesem', pack3: '3 pesmi', pack10: '10 pesmi' },
  dateLocale: 'sl-SI',
};
const BS: Dict = {
  ...SR,
  giftTiers: { single: '1 pjesma', pack3: '3 pjesme', pack10: '10 pjesama' },
  dateLocale: 'bs-BA',
};

const DICTS: Record<EmailLocale, Dict> = { ro: RO, bg: BG, sr: SR, tr: TR, el: EL, hr: HR, sl: SL, bs: BS };

export function dict(locale: string | undefined | null): Dict {
  const k = (locale ?? 'ro') as EmailLocale;
  return DICTS[k] ?? FALLBACK;
}
