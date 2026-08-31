/**
 * Livrabilele de pachet (`features`) și eticheta de livrare, per limbă.
 *
 * `PACKAGES[tier].featuresRo` își spune limba în nume: e română, iar site-urile
 * fără override de admin o serveau ca atare. Confirmat pe producție 31 aug 2026 —
 * în configul public de pe `chalgapodarok.bg` și `doroparaggelia.gr` ajungeau
 * „Manea personalizată", „Versuri pe gustul tău", „Livrare în 5–10 minute",
 * „O refacere GRATUITĂ", chiar lângă restul interfeței traduse.
 *
 * Se aplică pe pachetul de BAZĂ, înainte de override-urile din admin — dacă
 * operatorul a scris el features pe interfața aceea, ale lui câștigă (le-a scris
 * în limba pe care o vrea). Ca peste tot: ro/bg/el traduse, restul pe engleză.
 */

import type { PackageTier } from './packages';

export type PackageLocale = 'ro' | 'bg' | 'el' | 'en';

const KNOWN: ReadonlySet<string> = new Set(['ro', 'bg', 'el']);

/**
 * Limba lipsă înseamnă „nu s-a schimbat nimic": cade pe `ro`, nu pe engleză.
 * Multe apeluri interne (snapshot la generare, statistici) nu au site-ul la
 * îndemână și nu pasează limba — dacă acelea ar primi engleză, un site ROMÂNESC
 * și-ar vedea pachetele în engleză. Doar o limbă cunoscută, dar netradusă, ia `en`.
 */
export function packageLocale(locale: string | null | undefined): PackageLocale {
  const l = (locale ?? '').trim().toLowerCase().split('-')[0];
  if (!l) return 'ro';
  return (KNOWN.has(l) ? l : 'en') as PackageLocale;
}

interface TierCopy {
  deliveryLabel: string;
  features: string[];
}

/** `ro` lipsește intenționat: e sursa din `packages.ts`, nu o copie care poate diverge. */
const COPY: Record<Exclude<PackageLocale, 'ro'>, Record<PackageTier, TierCopy>> = {
  bg: {
    basic: {
      deliveryLabel: '5–10 мин',
      features: [
        'Персонализирана песен',
        'Текст по твой вкус',
        'Доставка за 5–10 минути',
        'Едно БЕЗПЛАТНО преправяне',
      ],
    },
    plus: {
      deliveryLabel: 'Приоритетна доставка',
      features: [
        'Всичко от Стандарт',
        'Колаж с максимум 4 снимки — само припевът',
        'По-качествена песен',
        'Приоритетна доставка',
        '2 БЕЗПЛАТНИ преправяния',
        '25% отстъпка за следващата песен',
      ],
    },
    premium: {
      deliveryLabel: 'Приоритетна доставка',
      features: [
        'Всичко от Плюс',
        'Колаж с 15 снимки и цялата песен',
        'Персонализирана картичка',
        'По-дълга песен',
        'Приоритетна поддръжка',
        'Приоритетна доставка',
        '3 БЕЗПЛАТНИ преправяния',
        '40% отстъпка за следващата песен',
        'Публикация във Facebook и TikTok, с посвещение',
      ],
    },
  },
  el: {
    basic: {
      deliveryLabel: '5–10 λεπτά',
      features: [
        'Προσωποποιημένο τραγούδι',
        'Στίχοι στα μέτρα σου',
        'Παράδοση σε 5–10 λεπτά',
        'Μία ΔΩΡΕΑΝ επανάληψη',
      ],
    },
    plus: {
      deliveryLabel: 'Προτεραιότητα στην παράδοση',
      features: [
        'Όλα από το Στάνταρ',
        'Κολάζ με έως 4 φωτογραφίες — μόνο το ρεφρέν',
        'Τραγούδι καλύτερης ποιότητας',
        'Προτεραιότητα στην παράδοση',
        '2 ΔΩΡΕΑΝ επαναλήψεις',
        '25% έκπτωση στο επόμενο τραγούδι',
      ],
    },
    premium: {
      deliveryLabel: 'Προτεραιότητα στην παράδοση',
      features: [
        'Όλα από το Πλας',
        'Κολάζ με 15 φωτογραφίες και ολόκληρο το τραγούδι',
        'Προσωποποιημένη κάρτα',
        'Μεγαλύτερο τραγούδι',
        'Υποστήριξη με προτεραιότητα',
        'Προτεραιότητα στην παράδοση',
        '3 ΔΩΡΕΑΝ επαναλήψεις',
        '40% έκπτωση στο επόμενο τραγούδι',
        'Ανάρτηση σε Facebook και TikTok, με αφιέρωση',
      ],
    },
  },
  en: {
    basic: {
      deliveryLabel: '5–10 min',
      features: [
        'Personalised song',
        'Lyrics to your taste',
        'Delivered in 5–10 minutes',
        'One FREE remake',
      ],
    },
    plus: {
      deliveryLabel: 'Priority delivery',
      features: [
        'Everything in Standard',
        'Collage with up to 4 photos — chorus only',
        'Higher quality song',
        'Priority delivery',
        '2 FREE remakes',
        '25% off your next song',
      ],
    },
    premium: {
      deliveryLabel: 'Priority delivery',
      features: [
        'Everything in Plus',
        'Collage with 15 photos and the whole song',
        'Personalised greeting card',
        'Longer song',
        'Priority support',
        'Priority delivery',
        '3 FREE remakes',
        '40% off your next song',
        'Post on Facebook and TikTok, with a dedication',
      ],
    },
  },
};

/**
 * Textele de pachet pentru o limbă, sau `null` pe română (unde sursa rămâne
 * `PACKAGES[tier]` și nu vrem o a doua copie care să divergă de ea).
 */
export function packageCopy(tier: PackageTier, locale: string | null | undefined): TierCopy | null {
  const l = packageLocale(locale);
  return l === 'ro' ? null : COPY[l][tier];
}
