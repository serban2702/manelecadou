/**
 * Template-uri de MARKETING (oferte, reduceri, win-back, anunțuri).
 *
 * Spre deosebire de template-urile transacționale din `templates.ts` (magic-link,
 * payment, generation-ready) — care se trimit automat la evenimente — astea se
 * trimit din modulul de marketing: campanii manuale + reguli automate (drip).
 *
 * Fiecare template e o funcție pură `(vars) => { subject, html, text }` și e
 * înregistrat în `MARKETING_TEMPLATES` (registry-ul citit de admin pentru listare
 * + preview + trimitere). Ca să adaugi unul nou, vezi
 * `.claude/skills/add-email-template/SKILL.md`.
 */

import { renderBrandedEmail, type EmailBranding } from './templates';
import type { EmailLocale } from '../i18n/strings';

const COLORS = {
  goldFrom: '#fff5cc',
  goldMid: '#ffe28a',
  goldDeep: '#b07c1e',
  cream: '#fff5dc',
};

/** Variabile dinamice pe care le primește un template de marketing la render. */
export interface MarketingRenderVars {
  /** Numele destinatarului (ex. „Andrei"). Gol → salut generic. */
  recipientName?: string | null;
  /** Link-ul pe care duce butonul principal (de obicei pagina site-ului). */
  ctaUrl: string;
  /** Override pentru textul butonului. */
  ctaLabel?: string | null;
  /** Codul promo afișat în card (dacă oferta are reducere). */
  promoCode?: string | null;
  /** Eticheta reducerii pentru copy: ex. „20%" sau „15 lei". */
  discountLabel?: string | null;
  /** Data până la care e valabilă oferta (deja formatată pentru afișare). */
  validUntil?: string | null;
  /** Override de titlu (folosit mai ales de template-ul „anunț generic"). */
  headline?: string | null;
  /** Corp HTML custom (folosit de template-ul „anunț generic"). */
  bodyHtml?: string | null;
  /** Link one-click de dezabonare (doar marketing). Gol → nu se afișează footer-ul. */
  unsubscribeUrl?: string | null;
  locale?: string;
  branding?: EmailBranding;
}

function escape(s: string | number | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Buton gold inline (același stil ca `buttonGold` din templates.ts, dar local
 *  ca să nu depindem de un export privat). */
function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto;">
    <tr><td style="border-radius:10px;background: linear-gradient(180deg, ${COLORS.goldFrom} 0%, ${COLORS.goldMid} 30%, #f1c84d 60%, ${COLORS.goldDeep} 100%);box-shadow:0 6px 16px rgba(241,200,77,0.3);">
      <a href="${escape(href)}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:800;color:#2a1a04;text-decoration:none;letter-spacing:0.02em;">${escape(label)}</a>
    </td></tr>
  </table>`;
}

/** Card-ul cu codul de reducere (dashed border, monospace). */
function promoCard(code: string, discountLabel: string | null | undefined, validUntil: string | null | undefined, t: DiscountStrings): string {
  return `<div style="text-align:center;background:rgba(241,200,77,0.08);border:2px dashed rgba(241,200,77,0.5);border-radius:12px;padding:22px;margin:18px 0;">
    <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,245,220,0.55);">${escape(t.codeLabel)}${discountLabel ? ` · −${escape(discountLabel)}` : ''}</p>
    <p style="margin:0;font-family:'Courier New',monospace;font-size:30px;font-weight:900;color:${COLORS.goldMid};letter-spacing:0.1em;">${escape(code)}</p>
    ${validUntil ? `<p style="margin:8px 0 0;font-size:12px;color:rgba(255,245,220,0.55);">${escape(t.validLabel)} ${escape(validUntil)}</p>` : ''}
  </div>`;
}

// =================== i18n (concis, 8 locale) ===================

interface DiscountStrings {
  subject: (discount: string) => string;
  headline: string;
  intro: (name: string) => string;
  codeLabel: string;
  validLabel: string;
  cta: string;
  ps: string;
}
interface WinbackStrings {
  subject: string;
  headline: string;
  intro: (name: string) => string;
  cta: string;
}
interface SummerStrings {
  subject: string;
  headline: string;
  /** corpul emoțional, primește prefixul de nume (ex. „Andrei, ") */
  intro: (name: string) => string;
  cta: string;
  ps: string;
}

interface MarketingStrings {
  discount: DiscountStrings;
  winback: WinbackStrings;
  summer: SummerStrings;
  /** salut folosit când avem numele; și varianta fără nume */
  helloNamed: (name: string) => string;
  helloGeneric: string;
}

const RO: MarketingStrings = {
  helloNamed: (n) => `Salut, ${n}! 👋`,
  helloGeneric: 'Salut! 👋',
  discount: {
    subject: (d) => `🎁 Reducere ${d} la maneaua ta personalizată`,
    headline: 'O reducere specială, doar pentru tine',
    intro: (n) =>
      `${n}ne-am gândit la tine: ai mai jos un cod de reducere ca să-i faci cuiva drag cea mai tare surpriză — o manea personalizată, cu numele și povestea lui.`,
    codeLabel: 'Codul tău',
    validLabel: 'Valabil până la',
    cta: 'Folosește reducerea',
    ps: 'Introdu codul la finalizarea comenzii. Te așteptăm! 🎶',
  },
  winback: {
    subject: '🎶 Ne-a plăcut să-ți facem maneaua — hai să mai facem una',
    headline: 'Mulțumim că ai ales Manele Cadou!',
    intro: (n) =>
      `${n}sperăm că ți-a plăcut surpriza. Avem un cod de reducere pregătit pentru următoarea ta comandă — pentru o aniversare, o nuntă sau pur și simplu ca să faci pe cineva fericit.`,
    cta: 'Comandă din nou cu reducere',
  },
  summer: {
    subject: '☀️ A venit vara — fă-i cuiva drag o surpriză pe care n-o uită niciodată',
    headline: 'Vara trece repede. Amintirile rămân.',
    intro: (n) =>
      `${n}vara trece repede. Zilele lungi, oamenii dragi adunați la masă, melodia care pornește și toată lumea știe versurile... Anul ăsta, fii tu cel care creează momentul. O manea personalizată — cu numele lui, cu povestea voastră — e genul de cadou care rămâne. Nu o vitrină, nu încă un obiect uitat într-un sertar. O amintire. Ai mai jos reducerea ta de vară — nu lăsa vara să treacă fără să-i spui cât de mult înseamnă pentru tine.`,
    cta: 'Creează maneaua acum',
    ps: 'Reducerea e valabilă doar câteva zile. Cei dragi merită mai mult decât un mesaj pe WhatsApp. 🎶',
  },
};

const EN: MarketingStrings = {
  helloNamed: (n) => `Hi, ${n}! 👋`,
  helloGeneric: 'Hi there! 👋',
  discount: {
    subject: (d) => `🎁 ${d} off your personalized song`,
    headline: 'A special discount, just for you',
    intro: (n) =>
      `${n}we thought of you: here's a discount code to surprise someone with a personalized song — with their name and their story.`,
    codeLabel: 'Your code',
    validLabel: 'Valid until',
    cta: 'Use the discount',
    ps: 'Enter the code at checkout. See you soon! 🎶',
  },
  winback: {
    subject: '🎶 We loved making your song — let’s make another',
    headline: 'Thanks for choosing us!',
    intro: (n) =>
      `${n}we hope you loved the surprise. Here's a discount code for your next order — for a birthday, a wedding, or just to make someone happy.`,
    cta: 'Order again with a discount',
  },
  summer: {
    subject: '☀️ Summer is here — give someone you love a surprise they’ll never forget',
    headline: 'Summer flies by. Memories stay.',
    intro: (n) =>
      `${n}summer flies by. The long days, the people you love gathered around the table, the song that starts and everyone knows the words... This year, be the one who creates the moment. A personalized song — with their name, with your story — is the kind of gift that lasts. Not a trinket forgotten in a drawer. A memory. Here's your summer discount — don't let summer pass without telling them how much they mean to you.`,
    cta: 'Create the song now',
    ps: 'The discount is valid for just a few days. The ones you love deserve more than a WhatsApp message. 🎶',
  },
};

const BG: MarketingStrings = {
  helloNamed: (n) => `Здравей, ${n}! 👋`,
  helloGeneric: 'Здравей! 👋',
  discount: {
    subject: (d) => `🎁 ${d} отстъпка за твоята персонализирана песен`,
    headline: 'Специална отстъпка само за теб',
    intro: (n) =>
      `${n}помислихме за теб: ето код за отстъпка, за да изненадаш някого с персонализирана песен — с неговото име и история.`,
    codeLabel: 'Твоят код',
    validLabel: 'Валиден до',
    cta: 'Използвай отстъпката',
    ps: 'Въведи кода при поръчка. Очакваме те! 🎶',
  },
  winback: {
    subject: '🎶 Радвахме се да направим песента ти — да направим още една',
    headline: 'Благодарим, че ни избра!',
    intro: (n) =>
      `${n}надяваме се, че изненадата ти хареса. Ето код за отстъпка за следващата поръчка.`,
    cta: 'Поръчай отново с отстъпка',
  },
  summer: {
    subject: '☀️ Лятото дойде — изненадай някой скъп с нещо незабравимо',
    headline: 'Лятото минава бързо. Спомените остават.',
    intro: (n) =>
      `${n}лятото минава бързо. Дългите дни, скъпите хора около масата, песента, която започва и всички знаят думите... Тази година бъди ти този, който създава момента. Персонализирана песен — с неговото име, с вашата история — е подарък, който остава. Спомен, а не поредната забравена вещ. Ето твоята лятна отстъпка — не оставяй лятото да отмине, без да му кажеш колко означава за теб.`,
    cta: 'Създай песента сега',
    ps: 'Отстъпката е валидна само няколко дни. Скъпите хора заслужават повече от съобщение. 🎶',
  },
};

const SR: MarketingStrings = {
  helloNamed: (n) => `Здраво, ${n}! 👋`,
  helloGeneric: 'Здраво! 👋',
  discount: {
    subject: (d) => `🎁 ${d} popusta na tvoju personalizovanu pesmu`,
    headline: 'Poseban popust, samo za tebe',
    intro: (n) =>
      `${n}mislili smo na tebe: evo kod za popust da iznenadiš nekoga personalizovanom pesmom — sa njegovim imenom i pričom.`,
    codeLabel: 'Tvoj kod',
    validLabel: 'Važi do',
    cta: 'Iskoristi popust',
    ps: 'Unesi kod prilikom porudžbine. Čekamo te! 🎶',
  },
  winback: {
    subject: '🎶 Uživali smo praveći tvoju pesmu — hajde da napravimo još jednu',
    headline: 'Hvala što si izabrao nas!',
    intro: (n) => `${n}nadamo se da ti se iznenađenje dopalo. Evo kod za popust za sledeću porudžbinu.`,
    cta: 'Poruči ponovo uz popust',
  },
  summer: {
    subject: '☀️ Stiglo je leto — iznenadi nekog dragog nečim nezaboravnim',
    headline: 'Leto brzo prođe. Uspomene ostaju.',
    intro: (n) =>
      `${n}leto brzo prođe. Dugi dani, dragi ljudi okupljeni za stolom, pesma koja krene i svi znaju reči... Ove godine budi ti taj koji stvara trenutak. Personalizovana pesma — sa njegovim imenom, sa vašom pričom — poklon je koji ostaje. Uspomena, a ne još jedna zaboravljena sitnica. Evo tvog letnjeg popusta — ne dozvoli da leto prođe a da mu ne kažeš koliko ti znači.`,
    cta: 'Napravi pesmu sada',
    ps: 'Popust važi samo nekoliko dana. Dragi ljudi zaslužuju više od poruke. 🎶',
  },
};

const TR: MarketingStrings = {
  helloNamed: (n) => `Merhaba, ${n}! 👋`,
  helloGeneric: 'Merhaba! 👋',
  discount: {
    subject: (d) => `🎁 Kişiye özel şarkında ${d} indirim`,
    headline: 'Sadece sana özel bir indirim',
    intro: (n) =>
      `${n}seni düşündük: birini kişiye özel bir şarkıyla şaşırtman için bir indirim kodu — ismi ve hikâyesiyle.`,
    codeLabel: 'Kodun',
    validLabel: 'Geçerlilik',
    cta: 'İndirimi kullan',
    ps: 'Kodu ödeme sırasında gir. Bekleriz! 🎶',
  },
  winback: {
    subject: '🎶 Şarkını yapmayı sevdik — bir tane daha yapalım',
    headline: 'Bizi seçtiğin için teşekkürler!',
    intro: (n) => `${n}umarız sürprizi beğenmişsindir. Bir sonraki siparişin için indirim kodu hazır.`,
    cta: 'İndirimle tekrar sipariş ver',
  },
  summer: {
    subject: '☀️ Yaz geldi — sevdiğin birine asla unutamayacağı bir sürpriz yap',
    headline: 'Yaz çabuk geçer. Anılar kalır.',
    intro: (n) =>
      `${n}yaz çabuk geçer. Uzun günler, masanın etrafında toplanan sevdiklerin, başlayan ve herkesin sözlerini bildiği şarkı... Bu yıl o anı yaratan sen ol. Kişiye özel bir şarkı — onun adıyla, sizin hikâyenizle — kalıcı bir hediyedir. Bir çekmecede unutulan eşya değil, bir anı. İşte yaz indirimin — yaz geçip gitmeden ona ne kadar değerli olduğunu söyle.`,
    cta: 'Şarkıyı şimdi oluştur',
    ps: 'İndirim sadece birkaç gün geçerli. Sevdiklerin bir mesajdan fazlasını hak ediyor. 🎶',
  },
};

const EL: MarketingStrings = {
  helloNamed: (n) => `Γεια σου, ${n}! 👋`,
  helloGeneric: 'Γεια σου! 👋',
  discount: {
    subject: (d) => `🎁 ${d} έκπτωση στο προσωποποιημένο σου τραγούδι`,
    headline: 'Μια ειδική έκπτωση, μόνο για σένα',
    intro: (n) =>
      `${n}σε σκεφτήκαμε: ένας κωδικός έκπτωσης για να κάνεις δώρο ένα προσωποποιημένο τραγούδι — με το όνομα και την ιστορία του.`,
    codeLabel: 'Ο κωδικός σου',
    validLabel: 'Ισχύει έως',
    cta: 'Χρησιμοποίησε την έκπτωση',
    ps: 'Βάλε τον κωδικό στο ταμείο. Σε περιμένουμε! 🎶',
  },
  winback: {
    subject: '🎶 Μας άρεσε να φτιάξουμε το τραγούδι σου — ας φτιάξουμε άλλο ένα',
    headline: 'Ευχαριστούμε που μας επέλεξες!',
    intro: (n) => `${n}ελπίζουμε να σου άρεσε η έκπληξη. Ένας κωδικός έκπτωσης για την επόμενη παραγγελία.`,
    cta: 'Παράγγειλε ξανά με έκπτωση',
  },
  summer: {
    subject: '☀️ Ήρθε το καλοκαίρι — κάνε σε κάποιον αγαπημένο μια αξέχαστη έκπληξη',
    headline: 'Το καλοκαίρι περνά γρήγορα. Οι αναμνήσεις μένουν.',
    intro: (n) =>
      `${n}το καλοκαίρι περνά γρήγορα. Οι μεγάλες μέρες, οι αγαπημένοι μαζεμένοι γύρω από το τραπέζι, το τραγούδι που ξεκινά και όλοι ξέρουν τα λόγια... Φέτος, γίνε εσύ αυτός που δημιουργεί τη στιγμή. Ένα προσωποποιημένο τραγούδι — με το όνομά του, με τη δική σας ιστορία — είναι δώρο που μένει. Μια ανάμνηση, όχι άλλο ένα ξεχασμένο αντικείμενο. Ορίστε η καλοκαιρινή σου έκπτωση — μην αφήσεις το καλοκαίρι να περάσει χωρίς να του πεις πόσο σημαίνει για σένα.`,
    cta: 'Δημιούργησε το τραγούδι τώρα',
    ps: 'Η έκπτωση ισχύει μόνο για λίγες μέρες. Οι αγαπημένοι αξίζουν κάτι παραπάνω από ένα μήνυμα. 🎶',
  },
};

const HR: MarketingStrings = {
  helloNamed: (n) => `Bok, ${n}! 👋`,
  helloGeneric: 'Bok! 👋',
  discount: {
    subject: (d) => `🎁 ${d} popusta na tvoju personaliziranu pjesmu`,
    headline: 'Poseban popust, samo za tebe',
    intro: (n) =>
      `${n}mislili smo na tebe: evo kod za popust da iznenadiš nekoga personaliziranom pjesmom — s njegovim imenom i pričom.`,
    codeLabel: 'Tvoj kod',
    validLabel: 'Vrijedi do',
    cta: 'Iskoristi popust',
    ps: 'Unesi kod prilikom narudžbe. Čekamo te! 🎶',
  },
  winback: {
    subject: '🎶 Uživali smo praveći tvoju pjesmu — napravimo još jednu',
    headline: 'Hvala što si izabrao nas!',
    intro: (n) => `${n}nadamo se da ti se iznenađenje svidjelo. Evo kod za popust za sljedeću narudžbu.`,
    cta: 'Naruči ponovno uz popust',
  },
  summer: {
    subject: '☀️ Stiglo je ljeto — iznenadi nekog dragog nečim nezaboravnim',
    headline: 'Ljeto brzo prođe. Uspomene ostaju.',
    intro: (n) =>
      `${n}ljeto brzo prođe. Dugi dani, dragi ljudi okupljeni za stolom, pjesma koja krene i svi znaju riječi... Ove godine budi ti taj koji stvara trenutak. Personalizirana pjesma — s njegovim imenom, s vašom pričom — poklon je koji ostaje. Uspomena, a ne još jedna zaboravljena sitnica. Evo tvog ljetnog popusta — ne dopusti da ljeto prođe a da mu ne kažeš koliko ti znači.`,
    cta: 'Napravi pjesmu sada',
    ps: 'Popust vrijedi samo nekoliko dana. Dragi ljudi zaslužuju više od poruke. 🎶',
  },
};

const SL: MarketingStrings = {
  helloNamed: (n) => `Živjo, ${n}! 👋`,
  helloGeneric: 'Živjo! 👋',
  discount: {
    subject: (d) => `🎁 ${d} popusta na tvojo personalizirano pesem`,
    headline: 'Poseben popust, samo zate',
    intro: (n) =>
      `${n}mislili smo nate: tukaj je koda za popust, da nekoga presenetiš s personalizirano pesmijo — z njegovim imenom in zgodbo.`,
    codeLabel: 'Tvoja koda',
    validLabel: 'Velja do',
    cta: 'Uporabi popust',
    ps: 'Vnesi kodo ob naročilu. Se vidimo! 🎶',
  },
  winback: {
    subject: '🎶 Z veseljem smo ustvarili tvojo pesem — ustvarimo še eno',
    headline: 'Hvala, da si izbral nas!',
    intro: (n) => `${n}upamo, da ti je bilo presenečenje všeč. Tukaj je koda za popust za naslednje naročilo.`,
    cta: 'Naroči znova s popustom',
  },
  summer: {
    subject: '☀️ Poletje je tu — nekomu dragemu pripravi nepozabno presenečenje',
    headline: 'Poletje hitro mine. Spomini ostanejo.',
    intro: (n) =>
      `${n}poletje hitro mine. Dolgi dnevi, dragi ljudje zbrani za mizo, pesem, ki se začne in vsi poznajo besedilo... Letos bodi ti tisti, ki ustvari trenutek. Personalizirana pesem — z njegovim imenom, z vajino zgodbo — je darilo, ki ostane. Spomin, ne še en pozabljen predmet. Tukaj je tvoj poletni popust — ne pusti, da poletje mine, ne da bi mu povedal, koliko ti pomeni.`,
    cta: 'Ustvari pesem zdaj',
    ps: 'Popust velja le nekaj dni. Dragi ljudje si zaslužijo več kot sporočilo. 🎶',
  },
};

const BS: MarketingStrings = {
  helloNamed: (n) => `Zdravo, ${n}! 👋`,
  helloGeneric: 'Zdravo! 👋',
  discount: {
    subject: (d) => `🎁 ${d} popusta na tvoju personaliziranu pjesmu`,
    headline: 'Poseban popust, samo za tebe',
    intro: (n) =>
      `${n}mislili smo na tebe: evo kod za popust da iznenadiš nekoga personaliziranom pjesmom — sa njegovim imenom i pričom.`,
    codeLabel: 'Tvoj kod',
    validLabel: 'Vrijedi do',
    cta: 'Iskoristi popust',
    ps: 'Unesi kod prilikom narudžbe. Čekamo te! 🎶',
  },
  winback: {
    subject: '🎶 Uživali smo praveći tvoju pjesmu — napravimo još jednu',
    headline: 'Hvala što si izabrao nas!',
    intro: (n) => `${n}nadamo se da ti se iznenađenje dopalo. Evo kod za popust za sljedeću narudžbu.`,
    cta: 'Naruči ponovo uz popust',
  },
  summer: {
    subject: '☀️ Stiglo je ljeto — iznenadi nekog dragog nečim nezaboravnim',
    headline: 'Ljeto brzo prođe. Uspomene ostaju.',
    intro: (n) =>
      `${n}ljeto brzo prođe. Dugi dani, dragi ljudi okupljeni za stolom, pjesma koja krene i svi znaju riječi... Ove godine budi ti taj koji stvara trenutak. Personalizirana pjesma — sa njegovim imenom, sa vašom pričom — poklon je koji ostaje. Uspomena, a ne još jedna zaboravljena sitnica. Evo tvog ljetnog popusta — ne dozvoli da ljeto prođe a da mu ne kažeš koliko ti znači.`,
    cta: 'Napravi pjesmu sada',
    ps: 'Popust važi samo nekoliko dana. Dragi ljudi zaslužuju više od poruke. 🎶',
  },
};

const MARKETING_STRINGS: Record<EmailLocale, MarketingStrings> = {
  ro: RO, bg: BG, sr: SR, tr: TR, el: EL, hr: HR, sl: SL, bs: BS,
};

function mstr(locale?: string): MarketingStrings {
  const l = (locale as EmailLocale) ?? 'ro';
  return MARKETING_STRINGS[l] ?? EN;
}

/** Eticheta de dezabonare per locale (cu fallback EN). */
const UNSUBSCRIBE_LABEL: Record<EmailLocale, { text: string; link: string }> = {
  ro: { text: 'Nu mai vrei oferte?', link: 'Dezabonează-te' },
  bg: { text: 'Не искаш повече оферти?', link: 'Отпиши се' },
  sr: { text: 'Ne želiš više ponude?', link: 'Odjavi se' },
  tr: { text: 'Artık teklif istemiyor musun?', link: 'Abonelikten çık' },
  el: { text: 'Δεν θέλεις άλλες προσφορές;', link: 'Διαγραφή' },
  hr: { text: 'Ne želiš više ponude?', link: 'Odjavi se' },
  sl: { text: 'Ne želiš več ponudb?', link: 'Odjava' },
  bs: { text: 'Ne želiš više ponude?', link: 'Odjavi se' },
};

/** Footer cu link de dezabonare — afișat doar dacă avem `unsubscribeUrl`. */
function unsubscribeFooter(url: string | null | undefined, locale?: string): string {
  if (!url) return '';
  const l = (locale as EmailLocale) ?? 'ro';
  const lbl = UNSUBSCRIBE_LABEL[l] ?? { text: "Don't want offers?", link: 'Unsubscribe' };
  return `<p style="margin:22px 0 0;font-size:11px;color:rgba(255,245,220,0.4);text-align:center;line-height:1.5;">
    ${escape(lbl.text)} <a href="${escape(url)}" style="color:rgba(255,245,220,0.6);text-decoration:underline;">${escape(lbl.link)}</a>
  </p>`;
}

/** Salutul, în funcție de existența numelui. */
function greeting(s: MarketingStrings, name?: string | null): string {
  const n = (name ?? '').trim();
  return n ? s.helloNamed(escape(n)) : s.helloGeneric;
}

/** Prefix de nume pentru `intro` (ex. „Andrei, " sau „"). */
function namePrefix(name?: string | null): string {
  const n = (name ?? '').trim();
  return n ? `${escape(n)}, ` : '';
}

// =================== Templates ===================

/** Ofertă cu cod de reducere — folosit la campanii manuale + reguli „nonpayer". */
export function discountOfferTemplate(v: MarketingRenderVars): { subject: string; html: string; text: string } {
  const s = mstr(v.locale);
  const t = s.discount;
  const discount = v.discountLabel ?? '';
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:18px;color:${COLORS.goldMid};font-weight:700;">${greeting(s, v.recipientName)}</p>
    <h2 style="margin:0 0 12px;font-family:'Times New Roman',serif;color:${COLORS.goldMid};font-size:22px;">${escape(v.headline || t.headline)}</h2>
    <p style="margin:0 0 8px;color:${COLORS.cream};line-height:1.6;">${t.intro(namePrefix(v.recipientName))}</p>
    ${v.promoCode ? promoCard(v.promoCode, v.discountLabel, v.validUntil, t) : ''}
    <div style="text-align:center;">${ctaButton(v.ctaUrl, v.ctaLabel || t.cta)}</div>
    <p style="margin:14px 0 0;font-size:13px;color:rgba(255,245,220,0.6);text-align:center;">${escape(t.ps)}</p>
    ${unsubscribeFooter(v.unsubscribeUrl, v.locale)}
  `;
  return {
    subject: t.subject(discount || '🎁'),
    html: renderBrandedEmail({
      subject: t.subject(discount || '🎁'),
      preheader: v.headline || t.headline,
      locale: v.locale,
      branding: v.branding,
      bodyHtml,
    }),
    text: `${greeting(s, v.recipientName)}\n\n${t.intro(namePrefix(v.recipientName))}\n${v.promoCode ? `\n${t.codeLabel}: ${v.promoCode}${v.discountLabel ? ` (−${v.discountLabel})` : ''}${v.validUntil ? `\n${t.validLabel} ${v.validUntil}` : ''}\n` : ''}\n${t.cta}: ${v.ctaUrl}\n\n${t.ps}`,
  };
}

/** Win-back pentru clienți care AU plătit — folosit la reguli „payer". */
export function winbackTemplate(v: MarketingRenderVars): { subject: string; html: string; text: string } {
  const s = mstr(v.locale);
  const t = s.winback;
  const dt = s.discount;
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:18px;color:${COLORS.goldMid};font-weight:700;">${greeting(s, v.recipientName)}</p>
    <h2 style="margin:0 0 12px;font-family:'Times New Roman',serif;color:${COLORS.goldMid};font-size:22px;">${escape(v.headline || t.headline)}</h2>
    <p style="margin:0 0 8px;color:${COLORS.cream};line-height:1.6;">${t.intro(namePrefix(v.recipientName))}</p>
    ${v.promoCode ? promoCard(v.promoCode, v.discountLabel, v.validUntil, dt) : ''}
    <div style="text-align:center;">${ctaButton(v.ctaUrl, v.ctaLabel || t.cta)}</div>
    ${unsubscribeFooter(v.unsubscribeUrl, v.locale)}
  `;
  return {
    subject: v.headline ? `🎶 ${v.headline}` : t.subject,
    html: renderBrandedEmail({
      subject: t.subject,
      preheader: v.headline || t.headline,
      locale: v.locale,
      branding: v.branding,
      bodyHtml,
    }),
    text: `${greeting(s, v.recipientName)}\n\n${t.intro(namePrefix(v.recipientName))}\n${v.promoCode ? `\n${dt.codeLabel}: ${v.promoCode}${v.discountLabel ? ` (−${v.discountLabel})` : ''}\n` : ''}\n${t.cta}: ${v.ctaUrl}`,
  };
}

/** Ofertă de vară — copy emoțional/nostalgic + cod de reducere. Campanie sezonieră. */
export function summerOfferTemplate(v: MarketingRenderVars): { subject: string; html: string; text: string } {
  const s = mstr(v.locale);
  const t = s.summer;
  const subject = v.headline || t.subject;
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:18px;color:${COLORS.goldMid};font-weight:700;">${greeting(s, v.recipientName)}</p>
    <h2 style="margin:0 0 12px;font-family:'Times New Roman',serif;color:${COLORS.goldMid};font-size:22px;">${escape(v.headline || t.headline)}</h2>
    <p style="margin:0 0 8px;color:${COLORS.cream};line-height:1.6;">${t.intro(namePrefix(v.recipientName))}</p>
    ${v.promoCode ? promoCard(v.promoCode, v.discountLabel, v.validUntil, s.discount) : ''}
    <div style="text-align:center;">${ctaButton(v.ctaUrl, v.ctaLabel || t.cta)}</div>
    <p style="margin:14px 0 0;font-size:13px;color:rgba(255,245,220,0.6);text-align:center;">${escape(t.ps)}</p>
    ${unsubscribeFooter(v.unsubscribeUrl, v.locale)}
  `;
  return {
    subject,
    html: renderBrandedEmail({
      subject,
      preheader: v.headline || t.headline,
      locale: v.locale,
      branding: v.branding,
      bodyHtml,
    }),
    text: `${greeting(s, v.recipientName)}\n\n${t.intro(namePrefix(v.recipientName))}\n${v.promoCode ? `\n${s.discount.codeLabel}: ${v.promoCode}${v.discountLabel ? ` (−${v.discountLabel})` : ''}${v.validUntil ? `\n${s.discount.validLabel} ${v.validUntil}` : ''}\n` : ''}\n${t.cta}: ${v.ctaUrl}\n\n${t.ps}`,
  };
}

/** Anunț generic — corpul îl scrie adminul (subject + headline + bodyHtml).
 *  Bun pentru newsletter / lansări / oferte ad-hoc fără cod. */
export function genericAnnouncementTemplate(v: MarketingRenderVars): { subject: string; html: string; text: string } {
  const s = mstr(v.locale);
  const subject = v.headline || 'Manele Cadou';
  const bodyInner = v.bodyHtml || '<p>—</p>';
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:18px;color:${COLORS.goldMid};font-weight:700;">${greeting(s, v.recipientName)}</p>
    ${v.headline ? `<h2 style="margin:0 0 12px;font-family:'Times New Roman',serif;color:${COLORS.goldMid};font-size:22px;">${escape(v.headline)}</h2>` : ''}
    <div style="color:${COLORS.cream};line-height:1.6;font-size:15px;">${bodyInner}</div>
    ${v.promoCode ? promoCard(v.promoCode, v.discountLabel, v.validUntil, s.discount) : ''}
    <div style="text-align:center;">${ctaButton(v.ctaUrl, v.ctaLabel || s.discount.cta)}</div>
    ${unsubscribeFooter(v.unsubscribeUrl, v.locale)}
  `;
  return {
    subject,
    html: renderBrandedEmail({
      subject,
      preheader: v.headline || subject,
      locale: v.locale,
      branding: v.branding,
      bodyHtml,
    }),
    text: `${greeting(s, v.recipientName)}\n\n${(v.bodyHtml || '').replace(/<[^>]+>/g, '')}\n\n${v.ctaUrl}`,
  };
}

// =================== Registry ===================

export interface MarketingTemplateMeta {
  id: string;
  name: string;
  description: string;
  /** Câmpurile dinamice pe care le suportă (controlează formularul din admin). */
  supports: {
    promoCode?: boolean;
    recipientName?: boolean;
    customHeadline?: boolean;
    customBody?: boolean;
  };
  render: (vars: MarketingRenderVars) => { subject: string; html: string; text: string };
  /** Valori demo pentru preview în admin. */
  sample: MarketingRenderVars;
}

const SAMPLE_BASE: MarketingRenderVars = {
  recipientName: 'Andrei',
  ctaUrl: 'https://manelecadou.ro',
  promoCode: 'CADOU20',
  discountLabel: '20%',
  validUntil: '31.12.2026',
  locale: 'ro',
};

export const MARKETING_TEMPLATES: MarketingTemplateMeta[] = [
  {
    id: 'discount_offer',
    name: 'Ofertă cu reducere',
    description:
      'Email de ofertă cu cod de reducere. Folosit pentru campanii manuale și pentru regula automată „celor care nu au plătit".',
    supports: { promoCode: true, recipientName: true, customHeadline: true },
    render: discountOfferTemplate,
    sample: SAMPLE_BASE,
  },
  {
    id: 'winback_payer',
    name: 'Win-back (au cumpărat)',
    description:
      'Mulțumire + reducere pentru clienții care AU plătit deja, ca să comande din nou. Folosit pentru regula automată „celor care au plătit".',
    supports: { promoCode: true, recipientName: true, customHeadline: true },
    render: winbackTemplate,
    sample: { ...SAMPLE_BASE, promoCode: 'REVINO15', discountLabel: '15%' },
  },
  {
    id: 'summer_offer',
    name: 'Ofertă de vară',
    description:
      'Campanie sezonieră de vară — copy nostalgic/emoțional + cod de reducere. „A venit vara, fă-i cuiva drag o surpriză."',
    supports: { promoCode: true, recipientName: true, customHeadline: true },
    render: summerOfferTemplate,
    sample: { ...SAMPLE_BASE, promoCode: 'VARA20', discountLabel: '20%', validUntil: '05.06.2026' },
  },
  {
    id: 'generic_announcement',
    name: 'Anunț generic',
    description:
      'Newsletter / anunț flexibil — scrii titlul și corpul mesajului. Opțional cu cod de reducere.',
    supports: { promoCode: true, recipientName: true, customHeadline: true, customBody: true },
    render: genericAnnouncementTemplate,
    sample: {
      ...SAMPLE_BASE,
      promoCode: null,
      discountLabel: null,
      validUntil: null,
      headline: 'Noutăți la Manele Cadou',
      bodyHtml:
        '<p>Am lansat pachete noi și voci noi pentru maneaua ta personalizată. Vino să asculți demo-uri și fă cuiva o surpriză de neuitat!</p>',
    },
  },
];

export function findMarketingTemplate(id: string): MarketingTemplateMeta | null {
  return MARKETING_TEMPLATES.find((t) => t.id === id) ?? null;
}
