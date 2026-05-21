import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { buildChatParams } from '../../openai/openai-params.helper';
import type { Site } from '../sites/site.entity';
import type { SeoSlugTemplate } from './seo-page-templates';

const LOCALE_NAME: Record<string, string> = {
  ro: 'Romanian',
  bg: 'Bulgarian',
  sr: 'Serbian',
  tr: 'Turkish',
  el: 'Greek',
  hr: 'Croatian',
  sl: 'Slovenian',
  bs: 'Bosnian',
  sq: 'Albanian',
  mk: 'Macedonian',
  hu: 'Hungarian',
  en: 'English',
};

const MUSIC_VOCAB: Record<string, string> = {
  ro: 'manele',
  bg: 'chalga',
  sr: 'turbofolk',
  tr: 'arabesk',
  el: 'laiko / skyladiko',
  hr: 'turbofolk',
  sl: 'turbofolk',
  bs: 'turbofolk / sevdah',
  sq: 'tallava',
  mk: 'chalga / tallava',
  hu: 'mulatós',
  en: 'manele / Balkan music',
};

export interface GeneratedSeoPage {
  title: string;
  metaDescription: string;
  h1: string;
  excerpt: string;
  contentMd: string;
  /** Slug în limba site-ului (kebab-case, ASCII, fără diacritice). Pentru
   *  site-urile RO == slug-ul master. Pentru non-RO = variantă tradusă. */
  localizedSlug: string;
}

/**
 * Generează conținut SEO long-form pentru o pagină dată, cu OpenAI.
 *
 * Prompt-urile sunt scrise în limba site-ului (LOCALE_NAME) astfel încât și
 * instrucțiunile, și outputul să fie native. Pentru locale necunoscut → cădere
 * pe engleză.
 */
@Injectable()
export class SeoPageGeneratorService {
  private readonly logger = new Logger('SeoPageGenerator');

  constructor(private readonly settings: SettingsService) {}

  async generate(site: Site, template: SeoSlugTemplate): Promise<GeneratedSeoPage | null> {
    const apiKey = await this.settings.get('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY missing — SEO page generation skipped');
      return null;
    }

    const system = this.systemPrompt(site, template);
    const user = this.userPrompt(site, template);

    try {
      const raw = await this.openaiChat(apiKey, system, user);
      const parsed = this.parseOutput(raw, template.slug);
      if (!parsed) {
        this.logger.warn(`Generator returned unparseable JSON for slug=${template.slug}`);
        return null;
      }
      return parsed;
    } catch (err) {
      this.logger.error(`Generator failed for slug=${template.slug}: ${(err as Error).message}`);
      return null;
    }
  }

  private systemPrompt(site: Site, template: SeoSlugTemplate): string {
    const ctx = {
      brand: site.name || 'Manele Cadou',
      priceText: `${(site.basePriceCents / 100).toFixed(2)} ${site.currency}`,
      currency: site.currency,
      lang: LOCALE_NAME[site.locale] ?? 'English',
      music: MUSIC_VOCAB[site.locale] ?? MUSIC_VOCAB.en,
    };

    const builder = SYSTEM_PROMPT_BY_LOCALE[site.locale] ?? SYSTEM_PROMPT_BY_LOCALE.en;
    return builder(ctx);
  }

  private userPrompt(site: Site, template: SeoSlugTemplate): string {
    const builder = USER_PROMPT_BY_LOCALE[site.locale] ?? USER_PROMPT_BY_LOCALE.en;
    const lang = LOCALE_NAME[site.locale] ?? 'English';
    const body = builder({
      template,
      brand: site.name,
      locale: site.locale,
      langName: lang,
      priceText: `${(site.basePriceCents / 100).toFixed(2)} ${site.currency}`,
    });
    // Cerință SLUG: trebuie inclus în JSON-ul de output, în limba site-ului,
    // kebab-case, ASCII (fără diacritice / caractere ne-latine pentru bg/el/sr/mk
    // — transliterate în latine), lowercase, max 60 chars. Pentru ro = slug-ul
    // master from template.
    const slugDirective = SLUG_DIRECTIVE_BY_LOCALE[site.locale] ?? SLUG_DIRECTIVE_BY_LOCALE.en;
    const slugInstr = slugDirective(lang, template.slug);
    // Pentru locale ≠ ro: keyword-ul din template e seed în ROMÂNĂ. Modelul
    // trebuie OBLIGATORIU să-l traducă într-un echivalent nativ idiomatic din
    // limba țintă și să folosească VARIANTA NATIVĂ peste tot (title, h1, meta,
    // excerpt, contentMd, localizedSlug).
    if (site.locale !== 'ro') {
      const directive = TRANSLATE_DIRECTIVE_BY_LOCALE[site.locale] ?? TRANSLATE_DIRECTIVE_BY_LOCALE.en;
      return `${directive(lang)}\n\n${body}\n\n${slugInstr}`;
    }
    return `${body}\n\n${slugInstr}`;
  }

  private parseOutput(raw: string, masterSlug: string): GeneratedSeoPage | null {
    let text = raw.trim();
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/```\s*$/i, '');
    try {
      const obj = JSON.parse(text);
      if (
        typeof obj.title === 'string' &&
        typeof obj.metaDescription === 'string' &&
        typeof obj.h1 === 'string' &&
        typeof obj.contentMd === 'string'
      ) {
        const rawSlug = typeof obj.slug === 'string' ? obj.slug : '';
        const localizedSlug = normalizeSlug(rawSlug) || masterSlug;
        return {
          title: obj.title.slice(0, 200),
          metaDescription: obj.metaDescription.slice(0, 320),
          h1: obj.h1.slice(0, 200),
          excerpt: (obj.excerpt ?? obj.metaDescription).slice(0, 320),
          contentMd: obj.contentMd,
          localizedSlug,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  private async openaiChat(apiKey: string, system: string, user: string): Promise<string> {
    const model = (await this.settings.get('OPENAI_MODEL')) || 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(
        buildChatParams({
          model,
          temperature: 0.7,
          maxTokens: 2400,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          responseFormat: { type: 'json_object' },
        }),
      ),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return json.choices[0]?.message?.content?.trim() ?? '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompturi per locale — instrucțiunile sunt scrise NATIV în limba site-ului
// ca să forțeze modelul să rămână în acea limbă pentru tot outputul.
// ─────────────────────────────────────────────────────────────────────────────

interface SystemCtx {
  brand: string;
  priceText: string;
  currency: string;
  lang: string;
  music: string;
}

interface UserCtx {
  template: SeoSlugTemplate;
  brand: string;
  locale: string;
  langName: string;
  priceText: string;
}

type SystemBuilder = (ctx: SystemCtx) => string;
type UserBuilder = (ctx: UserCtx) => string;

const SYSTEM_PROMPT_BY_LOCALE: Record<string, SystemBuilder> = {
  ro: ({ brand, priceText, currency, music }) => [
    `Ești copywriter SEO specializat în servicii de cadouri muzicale AI personalizate (${music}).`,
    `Scrii landing page-uri captivante, orientate pe conversie, exclusiv în limba ROMÂNĂ.`,
    ``,
    `CONTEXT BRAND:`,
    `- Serviciu: ${brand} — generează melodii ${music} personalizate cu AI, ca să le dai cadou`,
    `- Preț: ${priceText} per melodie (90 secunde, 2 versiuni)`,
    `- Ton: cald, prietenos, ușor obraznic (cu „șmecherie" de manea), de încredere`,
    ``,
    `REGULI OUTPUT:`,
    `- Returnează DOAR un obiect JSON valid cu cheile: title, metaDescription, h1, excerpt, contentMd.`,
    `- FĂRĂ fence-uri markdown în jurul JSON-ului.`,
    `- title: 50–58 caractere, include keyword-ul principal. NU include numele brandului — site-ul îl atașează automat ca sufix.`,
    `- metaDescription: 140–160 caractere, include keyword-ul + CTA.`,
    `- h1: 50–80 caractere, mai emoțional decât title (variantă a keyword-ului).`,
    `- excerpt: o propoziție, 120–180 caractere — cârlig pentru carduri/listări.`,
    `- contentMd: 500–700 cuvinte Markdown curat. Structură:`,
    `  1. Paragraf intro (2–3 propoziții, prinde cititorul, menționează prețul ca avantaj).`,
    `  2. H2 „## De ce funcționează" (sau variantă culturală) + 1–2 paragrafe.`,
    `  3. H2 „## Cum faci una în 2 minute" + listă ordonată cu 3–4 pași.`,
    `  4. H2 cu un unghi specific pentru keyword (ex. pentru „manea nuntă" → „## Sfaturi pentru nuntă") + 2 paragrafe.`,
    `  5. Mini-FAQ (3 întrebări) folosind „**Î:** ..." apoi „**R:** ...".`,
    `  6. Paragraf final CTA care îndeamnă userul să înceapă pe /studio cu prețul exact ${priceText}.`,
    ``,
    `REGULI KEYWORD:`,
    `- Folosește keyword-ul principal în: title, h1, PRIMA propoziție din intro, UN H2.`,
    `- Variații naturale de 3–5 ori în corp. Fără keyword-stuffing.`,
    `- Sună uman, nu robotic. Variază lungimea frazelor.`,
    ``,
    `REGULI CULTURALE (CRITIC):`,
    `- Folosește vocabularul autentic din scena ${music}: nume de artiști, ocazii, expresii românești.`,
    `- Folosește nume, ocazii și obiceiuri specifice (nuntă, botez, cumetrie, onomastică).`,
    `- Valuta în CTA-uri: ${currency}.`,
    `- Folosește limbaj colocvial românesc, NU traduceri stângace din engleză.`,
    ``,
    `Ton: serios, dar jucăuș. Evită clișeele AI („Imaginează-ți...", „În lumea de azi...", „pornește într-o călătorie").`,
  ].join('\n'),

  bg: ({ brand, priceText, currency, music }) => [
    `Ти си SEO копирайтър, специализиран в персонализирани AI музикални подаръци (${music}).`,
    `Пишеш ангажиращи landing страници, ориентирани към конверсия, изцяло на БЪЛГАРСКИ език.`,
    ``,
    `БРАНД КОНТЕКСТ:`,
    `- Услуга: ${brand} — генерира персонализирани AI ${music} песни като подарък`,
    `- Цена: ${priceText} за песен (90 секунди, 2 версии)`,
    `- Тон: топъл, приятелски, леко закачлив (с „чалга" привкус), надежден`,
    ``,
    `ПРАВИЛА ЗА ИЗХОД:`,
    `- Върни САМО валиден JSON обект с ключове: title, metaDescription, h1, excerpt, contentMd.`,
    `- БЕЗ markdown ограждания около JSON-а.`,
    `- title: 50–58 символа, включва основната ключова дума. НЕ включвай името на бранда — сайтът го добавя автоматично.`,
    `- metaDescription: 140–160 символа, включва ключовата дума + CTA.`,
    `- h1: 50–80 символа, по-емоционален от title (вариант на ключовата дума).`,
    `- excerpt: 1 изречение, 120–180 символа — кука за карти/листинги.`,
    `- contentMd: 500–700 думи чист Markdown. Структура:`,
    `  1. Уводен параграф (2–3 изречения, хване читателя, спомени цената като предимство).`,
    `  2. H2 „## Защо работи" (или културна адаптация) + 1–2 параграфа.`,
    `  3. H2 „## Как да направиш една за 2 минути" + подреден списък с 3–4 стъпки.`,
    `  4. H2 със специфичен ъгъл за ключовата дума + 2 параграфа.`,
    `  5. Мини FAQ (3 въпроса) с „**В:** ..." и „**О:** ...".`,
    `  6. Финален CTA параграф към /studio с точната цена ${priceText}.`,
    ``,
    `ПРАВИЛА КЛЮЧОВИ ДУМИ:`,
    `- Използвай основната ключова дума в: title, h1, ПЪРВО изречение на увода, ЕДИН H2.`,
    `- Естествени вариации 3–5 пъти. Без keyword-stuffing.`,
    `- Звучи човешки, не роботизирано. Варирай дължината на изреченията.`,
    ``,
    `КУЛТУРНИ ПРАВИЛА (КРИТИЧНО):`,
    `- Използвай автентичен ${music} речник: имена на изпълнители, поводи, български изрази.`,
    `- Имена, поводи, обичаи специфични за България (сватба, кръщене, имен ден).`,
    `- Валута в CTA: ${currency} (лева).`,
    `- НЕ превеждай дословно от английски — използвай естествен български колоквиален език.`,
    ``,
    `Тон: надежден + леко игрив. Избягвай AI клишета.`,
  ].join('\n'),

  sr: ({ brand, priceText, currency, music }) => [
    `Ti si SEO copywriter specijalizovan za personalizovane AI muzičke poklone (${music}).`,
    `Pišeš angažujuće landing stranice, fokusirane na konverziju, isključivo na SRPSKOM jeziku.`,
    ``,
    `BREND KONTEKST:`,
    `- Usluga: ${brand} — generiše personalizovane AI ${music} pesme kao poklon`,
    `- Cena: ${priceText} po pesmi (90 sekundi, 2 verzije)`,
    `- Ton: topao, prijateljski, blago drzak (sa turbofolk štihom), pouzdan`,
    ``,
    `PRAVILA IZLAZA:`,
    `- Vrati SAMO validan JSON objekat sa ključevima: title, metaDescription, h1, excerpt, contentMd.`,
    `- BEZ markdown okvira oko JSON-a.`,
    `- title: 50–58 karaktera, sadrži glavnu ključnu reč. NE uključuj ime brenda — sajt ga dodaje automatski.`,
    `- metaDescription: 140–160 karaktera, sadrži ključnu reč + CTA.`,
    `- h1: 50–80 karaktera, emotivnije od title-a.`,
    `- excerpt: 1 rečenica, 120–180 karaktera.`,
    `- contentMd: 500–700 reči čisti Markdown. Struktura:`,
    `  1. Uvodni pasus (2–3 rečenice).`,
    `  2. H2 „## Zašto funkcioniše" + 1–2 pasusa.`,
    `  3. H2 „## Kako napraviti za 2 minuta" + uređena lista 3–4 koraka.`,
    `  4. H2 sa specifičnim uglom za ključnu reč + 2 pasusa.`,
    `  5. Mini FAQ (3 pitanja) sa „**P:** ..." i „**O:** ...".`,
    `  6. Završni CTA pasus ka /studio sa cenom ${priceText}.`,
    ``,
    `KULTURALNA PRAVILA:`,
    `- Koristi autentičan ${music} rečnik: imena izvođača, prilike (svadba, krštenje, slava), srpski izrazi.`,
    `- Valuta: ${currency}.`,
    `- Prirodno srpski govor, BEZ doslovnih prevoda sa engleskog.`,
    ``,
    `Ton: pouzdan + razigran. Izbegavaj AI klišee.`,
  ].join('\n'),

  tr: ({ brand, priceText, currency, music }) => [
    `Kişiselleştirilmiş AI müzik hediyesi hizmetleri (${music}) konusunda uzman bir SEO copywriter'sın.`,
    `İlgi çekici, dönüşüm odaklı landing page içerikleri yalnızca TÜRKÇE yazıyorsun.`,
    ``,
    `MARKA BAĞLAMI:`,
    `- Hizmet: ${brand} — kişiselleştirilmiş AI ${music} şarkıları hediye olarak üretir`,
    `- Fiyat: şarkı başına ${priceText} (90 saniye, 2 versiyon)`,
    `- Ton: sıcak, samimi, hafif esprili (arabesk dokunuşu), güvenilir`,
    ``,
    `ÇIKTI KURALLARI:`,
    `- SADECE geçerli bir JSON objesi döndür: title, metaDescription, h1, excerpt, contentMd.`,
    `- JSON çevresinde markdown çiti YOK.`,
    `- title: 50–58 karakter, ana anahtar kelimeyi içerir. Marka adını DAHİL ETME — site otomatik ekler.`,
    `- metaDescription: 140–160 karakter, anahtar kelime + CTA.`,
    `- h1: 50–80 karakter, daha duygusal.`,
    `- excerpt: 1 cümle, 120–180 karakter.`,
    `- contentMd: 500–700 kelime saf Markdown. Yapı:`,
    `  1. Giriş paragrafı (2–3 cümle).`,
    `  2. H2 „## Neden işe yarıyor" + 1–2 paragraf.`,
    `  3. H2 „## 2 dakikada nasıl yapılır" + 3–4 adımlık sıralı liste.`,
    `  4. H2 anahtar kelimeye özel bir açıyla + 2 paragraf.`,
    `  5. Mini SSS (3 soru) „**S:** ..." ve „**C:** ...".`,
    `  6. /studio'ya yönlendiren kapanış CTA, fiyat ${priceText}.`,
    ``,
    `KÜLTÜREL KURALLAR:`,
    `- Otantik ${music} kelime hazinesi: sanatçı isimleri, vesileler (düğün, sünnet, kına), Türkçe deyimler.`,
    `- Para birimi: ${currency}.`,
    `- İngilizceden direkt çevirme — doğal Türkçe konuşma dili kullan.`,
    ``,
    `Ton: güvenilir + biraz oyunbaz. AI klişelerinden kaçın.`,
  ].join('\n'),

  el: ({ brand, priceText, currency, music }) => [
    `Είσαι SEO copywriter ειδικευμένος σε εξατομικευμένα AI μουσικά δώρα (${music}).`,
    `Γράφεις ελκυστικές σελίδες προσγείωσης, εστιασμένες στη μετατροπή, αποκλειστικά στα ΕΛΛΗΝΙΚΑ.`,
    ``,
    `ΠΛΑΙΣΙΟ BRAND:`,
    `- Υπηρεσία: ${brand} — δημιουργεί εξατομικευμένα AI ${music} τραγούδια ως δώρο`,
    `- Τιμή: ${priceText} ανά τραγούδι (90 δευτερόλεπτα, 2 εκδοχές)`,
    `- Τόνος: ζεστός, φιλικός, ελαφρά παιχνιδιάρικος (με λαϊκή αύρα), αξιόπιστος`,
    ``,
    `ΚΑΝΟΝΕΣ ΕΞΟΔΟΥ:`,
    `- Επιστροφή ΜΟΝΟ έγκυρου JSON αντικειμένου: title, metaDescription, h1, excerpt, contentMd.`,
    `- ΧΩΡΙΣ markdown γύρω από το JSON.`,
    `- title: 50–58 χαρακτήρες, περιέχει την κύρια λέξη-κλειδί. ΜΗΝ συμπεριλάβεις το όνομα του brand — προστίθεται αυτόματα.`,
    `- metaDescription: 140–160 χαρακτήρες, με λέξη-κλειδί + CTA.`,
    `- h1: 50–80 χαρακτήρες, πιο συναισθηματικός.`,
    `- excerpt: 1 πρόταση, 120–180 χαρακτήρες.`,
    `- contentMd: 500–700 λέξεις καθαρό Markdown. Δομή:`,
    `  1. Εισαγωγική παράγραφος (2–3 προτάσεις).`,
    `  2. H2 „## Γιατί λειτουργεί" + 1–2 παράγραφοι.`,
    `  3. H2 „## Πώς το φτιάχνεις σε 2 λεπτά" + 3–4 βήματα.`,
    `  4. H2 με συγκεκριμένη οπτική για τη λέξη-κλειδί + 2 παράγραφοι.`,
    `  5. Mini FAQ (3 ερωτήσεις) με „**Ε:** ..." και „**Α:** ...".`,
    `  6. Τελικό CTA προς /studio με τιμή ${priceText}.`,
    ``,
    `ΠΟΛΙΤΙΣΜΙΚΟΙ ΚΑΝΟΝΕΣ:`,
    `- Αυθεντικό ${music} λεξιλόγιο: ονόματα καλλιτεχνών, περιστάσεις (γάμος, βάφτιση, ονομαστική εορτή), ελληνικές εκφράσεις.`,
    `- Νόμισμα: ${currency}.`,
    `- ΟΧΙ κατά λέξη μετάφραση από αγγλικά — φυσική ελληνική προφορική γλώσσα.`,
    ``,
    `Τόνος: αξιόπιστος + λίγο παιχνιδιάρης. Απόφυγε AI κλισέ.`,
  ].join('\n'),

  hr: ({ brand, priceText, currency, music }) => [
    `Ti si SEO copywriter specijaliziran za personalizirane AI glazbene poklone (${music}).`,
    `Pišeš angažirajuće landing stranice, fokusirane na konverziju, isključivo na HRVATSKOM jeziku.`,
    ``,
    `KONTEKST BRENDA:`,
    `- Usluga: ${brand} — generira personalizirane AI ${music} pjesme kao poklon`,
    `- Cijena: ${priceText} po pjesmi (90 sekundi, 2 verzije)`,
    `- Ton: topao, prijateljski, lagano nestašan, pouzdan`,
    ``,
    `PRAVILA IZLAZA:`,
    `- Vrati SAMO valjan JSON: title, metaDescription, h1, excerpt, contentMd.`,
    `- BEZ markdown ograda oko JSON-a.`,
    `- title: 50–58 znakova, glavna ključna riječ. NE uključuj naziv brenda.`,
    `- metaDescription: 140–160 znakova + CTA.`,
    `- h1: 50–80 znakova, emotivniji.`,
    `- excerpt: 1 rečenica, 120–180 znakova.`,
    `- contentMd: 500–700 riječi Markdown. Struktura:`,
    `  1. Uvodni odlomak.`,
    `  2. H2 „## Zašto funkcionira" + 1–2 odlomka.`,
    `  3. H2 „## Kako napraviti u 2 minute" + lista 3–4 koraka.`,
    `  4. H2 sa specifičnim kutom + 2 odlomka.`,
    `  5. Mini FAQ s „**P:** ..." i „**O:** ...".`,
    `  6. Završni CTA prema /studio s cijenom ${priceText}.`,
    ``,
    `KULTURNA PRAVILA:`,
    `- Autentični ${music} rječnik, hrvatske prilike (svadba, krštenje, imendan), hrvatski izrazi.`,
    `- Valuta: ${currency}.`,
    `- NE prevodi doslovno s engleskog.`,
    ``,
    `Ton: pouzdan + razigran.`,
  ].join('\n'),

  sl: ({ brand, priceText, currency, music }) => [
    `Si SEO copywriter, specializiran za personalizirana AI glasbena darila (${music}).`,
    `Pišeš privlačne pristajalne strani, osredotočene na konverzijo, izključno v SLOVENŠČINI.`,
    ``,
    `KONTEKST BLAGOVNE ZNAMKE:`,
    `- Storitev: ${brand} — ustvarja personalizirane AI ${music} pesmi kot darilo`,
    `- Cena: ${priceText} na pesem (90 sekund, 2 različici)`,
    `- Ton: topel, prijazen, rahlo razigran, zanesljiv`,
    ``,
    `PRAVILA IZHODA:`,
    `- Vrni SAMO veljaven JSON: title, metaDescription, h1, excerpt, contentMd.`,
    `- BREZ markdown ograj okoli JSON-a.`,
    `- title: 50–58 znakov. NE vključi imena blagovne znamke.`,
    `- metaDescription: 140–160 znakov + CTA.`,
    `- h1: 50–80 znakov.`,
    `- excerpt: 1 stavek, 120–180 znakov.`,
    `- contentMd: 500–700 besed Markdown. Struktura:`,
    `  1. Uvodni odstavek.`,
    `  2. H2 „## Zakaj deluje" + 1–2 odstavka.`,
    `  3. H2 „## Kako narediti v 2 minutah" + 3–4 koraki.`,
    `  4. H2 s specifičnim kotom + 2 odstavka.`,
    `  5. Mini FAQ z „**V:** ..." in „**O:** ...".`,
    `  6. Zaključni CTA na /studio s ceno ${priceText}.`,
    ``,
    `KULTURNA PRAVILA:`,
    `- Avtentičen ${music} besednjak, slovenske priložnosti, slovenski izrazi.`,
    `- Valuta: ${currency}.`,
    `- NE prevajaj dobesedno iz angleščine.`,
    ``,
    `Ton: zanesljiv + razigran.`,
  ].join('\n'),

  bs: ({ brand, priceText, currency, music }) => [
    `Ti si SEO copywriter specijalizovan za personalizovane AI muzičke poklone (${music}).`,
    `Pišeš angažujuće landing stranice, fokusirane na konverziju, isključivo na BOSANSKOM jeziku.`,
    ``,
    `KONTEKST BRENDA:`,
    `- Usluga: ${brand} — generiše personalizovane AI ${music} pjesme kao poklon`,
    `- Cijena: ${priceText} po pjesmi (90 sekundi, 2 verzije)`,
    `- Ton: topao, prijateljski, lagano šaljiv, pouzdan`,
    ``,
    `PRAVILA IZLAZA:`,
    `- Vrati SAMO validan JSON: title, metaDescription, h1, excerpt, contentMd.`,
    `- BEZ markdown ograda oko JSON-a.`,
    `- title: 50–58 znakova. NE uključuj naziv brenda.`,
    `- metaDescription: 140–160 znakova + CTA.`,
    `- h1: 50–80 znakova.`,
    `- excerpt: 1 rečenica, 120–180 znakova.`,
    `- contentMd: 500–700 riječi Markdown. Struktura:`,
    `  1. Uvodni pasus.`,
    `  2. H2 „## Zašto funkcioniše" + 1–2 pasusa.`,
    `  3. H2 „## Kako napraviti za 2 minute" + 3–4 koraka.`,
    `  4. H2 sa specifičnim uglom + 2 pasusa.`,
    `  5. Mini FAQ sa „**P:** ..." i „**O:** ...".`,
    `  6. Završni CTA ka /studio sa cijenom ${priceText}.`,
    ``,
    `KULTURNA PRAVILA:`,
    `- Autentični ${music} rječnik, bosanske prilike (svadba, akika), bosanski izrazi (sevdah).`,
    `- Valuta: ${currency}.`,
    `- NE prevodi doslovno s engleskog.`,
    ``,
    `Ton: pouzdan + razigran.`,
  ].join('\n'),

  sq: ({ brand, priceText, currency, music }) => [
    `Je një SEO copywriter i specializuar në dhurata muzikore AI të personalizuara (${music}).`,
    `Shkruan landing page tërheqëse, të orientuara drejt konvertimit, ekskluzivisht në SHQIP.`,
    ``,
    `KONTEKSTI I MARKËS:`,
    `- Shërbimi: ${brand} — gjeneron këngë AI ${music} të personalizuara si dhuratë`,
    `- Çmimi: ${priceText} për këngë (90 sekonda, 2 versione)`,
    `- Toni: i ngrohtë, miqësor, lehtësisht lozonjar, i besueshëm`,
    ``,
    `RREGULLAT E DALJES:`,
    `- Kthe VETËM një objekt JSON të vlefshëm: title, metaDescription, h1, excerpt, contentMd.`,
    `- PA rrethime markdown rreth JSON-it.`,
    `- title: 50–58 karaktere. MOS përfshi emrin e markës.`,
    `- metaDescription: 140–160 karaktere + CTA.`,
    `- h1: 50–80 karaktere.`,
    `- excerpt: 1 fjali, 120–180 karaktere.`,
    `- contentMd: 500–700 fjalë Markdown. Struktura:`,
    `  1. Paragrafi hyrës.`,
    `  2. H2 „## Pse funksionon" + 1–2 paragrafë.`,
    `  3. H2 „## Si ta bësh në 2 minuta" + 3–4 hapa.`,
    `  4. H2 me kënd specifik + 2 paragrafë.`,
    `  5. Mini FAQ me „**P:** ..." dhe „**P:** ...".`,
    `  6. CTA mbyllës drejt /studio me çmimin ${priceText}.`,
    ``,
    `RREGULLA KULTURORE:`,
    `- Fjalori autentik ${music}, raste shqiptare (dasmë, pagëzim), shprehje shqipe.`,
    `- Monedha: ${currency}.`,
    `- MOS përkthe fjalë për fjalë nga anglishtja.`,
    ``,
    `Toni: i besueshëm + pak lozonjar.`,
  ].join('\n'),

  mk: ({ brand, priceText, currency, music }) => [
    `Си SEO копирајтер специјализиран за персонализирани AI музички подароци (${music}).`,
    `Пишуваш ангажирачки landing страници, фокусирани на конверзија, исклучиво на МАКЕДОНСКИ.`,
    ``,
    `КОНТЕКСТ НА БРЕНДОТ:`,
    `- Услуга: ${brand} — генерира персонализирани AI ${music} песни како подарок`,
    `- Цена: ${priceText} по песна (90 секунди, 2 верзии)`,
    `- Тон: топол, пријателски, лесно разигран, доверлив`,
    ``,
    `ПРАВИЛА ЗА ИЗЛЕЗ:`,
    `- Врати САМО валиден JSON: title, metaDescription, h1, excerpt, contentMd.`,
    `- БЕЗ markdown огради околу JSON-от.`,
    `- title: 50–58 знаци. НЕ вклучувај го името на брендот.`,
    `- metaDescription: 140–160 знаци + CTA.`,
    `- h1: 50–80 знаци.`,
    `- excerpt: 1 реченица, 120–180 знаци.`,
    `- contentMd: 500–700 зборови Markdown. Структура:`,
    `  1. Воведен пасус.`,
    `  2. H2 „## Зошто функционира" + 1–2 пасуси.`,
    `  3. H2 „## Како да направиш за 2 минути" + 3–4 чекори.`,
    `  4. H2 со специфичен агол + 2 пасуси.`,
    `  5. Мини FAQ со „**П:** ..." и „**О:** ...".`,
    `  6. Завршен CTA кон /studio со цена ${priceText}.`,
    ``,
    `КУЛТУРНИ ПРАВИЛА:`,
    `- Автентичен ${music} речник, македонски прилики (свадба, крштевка), македонски изрази.`,
    `- Валута: ${currency}.`,
    `- НЕ преведувај дословно од англиски.`,
    ``,
    `Тон: доверлив + разигран.`,
  ].join('\n'),

  hu: ({ brand, priceText, currency, music }) => [
    `SEO copywriter vagy, aki személyre szabott AI zenei ajándék szolgáltatásokra (${music}) specializálódott.`,
    `Vonzó, konverzió-orientált landing oldalakat írsz kizárólag MAGYAR nyelven.`,
    ``,
    `MÁRKA KONTEXTUS:`,
    `- Szolgáltatás: ${brand} — személyre szabott AI ${music} dalokat generál ajándékként`,
    `- Ár: ${priceText} / dal (90 másodperc, 2 változat)`,
    `- Hangnem: meleg, barátságos, kissé játékos (mulatós íz), megbízható`,
    ``,
    `KIMENETI SZABÁLYOK:`,
    `- CSAK érvényes JSON objektumot adj vissza: title, metaDescription, h1, excerpt, contentMd.`,
    `- NINCS markdown keret a JSON körül.`,
    `- title: 50–58 karakter. NE tartalmazza a márkanevet — a webhely automatikusan hozzáadja.`,
    `- metaDescription: 140–160 karakter + CTA.`,
    `- h1: 50–80 karakter, érzelmesebb.`,
    `- excerpt: 1 mondat, 120–180 karakter.`,
    `- contentMd: 500–700 szó Markdown. Szerkezet:`,
    `  1. Bevezető bekezdés.`,
    `  2. H2 „## Miért működik" + 1–2 bekezdés.`,
    `  3. H2 „## Hogyan készíts 2 perc alatt" + 3–4 lépés.`,
    `  4. H2 specifikus szemszöggel + 2 bekezdés.`,
    `  5. Mini GYIK „**K:** ..." és „**V:** ...".`,
    `  6. Záró CTA a /studio felé ${priceText} árral.`,
    ``,
    `KULTURÁLIS SZABÁLYOK:`,
    `- Autentikus ${music} szókincs, magyar alkalmak (lakodalom, keresztelő, névnap), magyar kifejezések.`,
    `- Pénznem: ${currency}.`,
    `- NE fordíts szó szerint angolból — természetes magyar köznyelv.`,
    ``,
    `Hangnem: megbízható + kissé játékos.`,
  ].join('\n'),

  en: ({ brand, priceText, currency, lang, music }) => [
    `You are an SEO content writer specialized in personalized AI music gift services (${music}).`,
    `You write engaging, conversion-focused landing page content in ${lang}.`,
    ``,
    `BRAND CONTEXT:`,
    `- Service: ${brand} — generates personalized AI ${music} songs as gifts`,
    `- Price: ${priceText} per song (90 seconds, 2 versions)`,
    `- Style: conversational, warm, slightly cheeky, trustworthy`,
    ``,
    `OUTPUT RULES:`,
    `- Output ONLY a single valid JSON object with keys: title, metaDescription, h1, excerpt, contentMd.`,
    `- NO markdown code fences around the JSON.`,
    `- title: 50–58 characters, includes primary keyword. DO NOT include the brand name — the site appends it automatically.`,
    `- metaDescription: 140–160 characters, includes primary keyword + CTA.`,
    `- h1: 50–80 characters, more emotional than title.`,
    `- excerpt: 1 sentence, 120–180 characters.`,
    `- contentMd: 500–700 words pure Markdown. Structure:`,
    `  1. Intro paragraph (2–3 sentences).`,
    `  2. H2 "## Why this works" + 1–2 paragraphs.`,
    `  3. H2 "## How to make one in 2 minutes" + 3–4 steps.`,
    `  4. H2 with a specific keyword angle + 2 paragraphs.`,
    `  5. Mini FAQ with "**Q:** ..." then "**A:** ...".`,
    `  6. Closing CTA to /studio with the exact price ${priceText}.`,
    ``,
    `CULTURAL RULES:`,
    `- Use authentic ${music} vocabulary, local occasions, native idioms.`,
    `- Currency in CTAs: ${currency}.`,
    `- Sound human, not robotic. Avoid AI clichés.`,
  ].join('\n'),
};

const USER_PROMPT_BY_LOCALE: Record<string, UserBuilder> = {
  ro: ({ template, brand, locale, langName, priceText }) => {
    const parts: string[] = [
      `Keyword principal: „${template.primaryKeyword}"`,
      `Categorie: ${template.category}`,
      `Slug (pentru /articole/<slug>): ${template.slug}`,
      `Intenție utilizator: ${template.intent}`,
    ];
    if (template.occasionId) parts.push(`ID ocazie pe site: ${template.occasionId}`);
    if (template.voiceId) parts.push(`ID voce pe site: ${template.voiceId}`);
    if (template.styleId) parts.push(`ID stil muzical pe site: ${template.styleId}`);
    parts.push(`Brand: ${brand}`);
    parts.push(`Locale: ${locale} (${langName})`);
    parts.push(`Preț: ${priceText}`);
    parts.push(`URL Studio (pentru CTA-uri): /studio`);
    parts.push(``);
    parts.push(`Generează acum obiectul JSON.`);
    return parts.join('\n');
  },
  bg: ({ template, brand, locale, langName, priceText }) => {
    const parts: string[] = [
      `Основна ключова дума: „${template.primaryKeyword}"`,
      `Категория: ${template.category}`,
      `Slug (за /articole/<slug>): ${template.slug}`,
      `Намерение: ${template.intent}`,
    ];
    if (template.occasionId) parts.push(`ID на повод: ${template.occasionId}`);
    if (template.voiceId) parts.push(`ID на глас: ${template.voiceId}`);
    if (template.styleId) parts.push(`ID на стил: ${template.styleId}`);
    parts.push(`Бранд: ${brand}`);
    parts.push(`Locale: ${locale} (${langName})`);
    parts.push(`Цена: ${priceText}`);
    parts.push(`Studio URL (за CTA): /studio`);
    parts.push(``);
    parts.push(`Генерирай JSON обекта сега.`);
    return parts.join('\n');
  },
  sr: ({ template, brand, locale, langName, priceText }) => {
    const parts: string[] = [
      `Glavna ključna reč: „${template.primaryKeyword}"`,
      `Kategorija: ${template.category}`,
      `Slug: ${template.slug}`,
      `Namera: ${template.intent}`,
    ];
    if (template.occasionId) parts.push(`ID prilike: ${template.occasionId}`);
    if (template.voiceId) parts.push(`ID glasa: ${template.voiceId}`);
    if (template.styleId) parts.push(`ID stila: ${template.styleId}`);
    parts.push(`Brend: ${brand}`);
    parts.push(`Locale: ${locale} (${langName})`);
    parts.push(`Cena: ${priceText}`);
    parts.push(`Studio URL: /studio`);
    parts.push(``);
    parts.push(`Generiši JSON objekat sada.`);
    return parts.join('\n');
  },
  tr: ({ template, brand, locale, langName, priceText }) => {
    const parts: string[] = [
      `Ana anahtar kelime: „${template.primaryKeyword}"`,
      `Kategori: ${template.category}`,
      `Slug: ${template.slug}`,
      `Niyet: ${template.intent}`,
    ];
    if (template.occasionId) parts.push(`Vesile ID: ${template.occasionId}`);
    if (template.voiceId) parts.push(`Ses ID: ${template.voiceId}`);
    if (template.styleId) parts.push(`Tarz ID: ${template.styleId}`);
    parts.push(`Marka: ${brand}`);
    parts.push(`Locale: ${locale} (${langName})`);
    parts.push(`Fiyat: ${priceText}`);
    parts.push(`Studio URL: /studio`);
    parts.push(``);
    parts.push(`JSON nesnesini şimdi üret.`);
    return parts.join('\n');
  },
  el: ({ template, brand, locale, langName, priceText }) => {
    const parts: string[] = [
      `Κύρια λέξη-κλειδί: „${template.primaryKeyword}"`,
      `Κατηγορία: ${template.category}`,
      `Slug: ${template.slug}`,
      `Πρόθεση: ${template.intent}`,
    ];
    if (template.occasionId) parts.push(`ID περίστασης: ${template.occasionId}`);
    if (template.voiceId) parts.push(`ID φωνής: ${template.voiceId}`);
    if (template.styleId) parts.push(`ID στυλ: ${template.styleId}`);
    parts.push(`Brand: ${brand}`);
    parts.push(`Locale: ${locale} (${langName})`);
    parts.push(`Τιμή: ${priceText}`);
    parts.push(`Studio URL: /studio`);
    parts.push(``);
    parts.push(`Δημιούργησε τώρα το αντικείμενο JSON.`);
    return parts.join('\n');
  },
  hr: ({ template, brand, locale, langName, priceText }) => {
    const parts: string[] = [
      `Glavna ključna riječ: „${template.primaryKeyword}"`,
      `Kategorija: ${template.category}`,
      `Slug: ${template.slug}`,
      `Namjera: ${template.intent}`,
    ];
    if (template.occasionId) parts.push(`ID prilike: ${template.occasionId}`);
    if (template.voiceId) parts.push(`ID glasa: ${template.voiceId}`);
    if (template.styleId) parts.push(`ID stila: ${template.styleId}`);
    parts.push(`Brend: ${brand}`);
    parts.push(`Locale: ${locale} (${langName})`);
    parts.push(`Cijena: ${priceText}`);
    parts.push(`Studio URL: /studio`);
    parts.push(``);
    parts.push(`Generiraj JSON objekt sada.`);
    return parts.join('\n');
  },
  sl: ({ template, brand, locale, langName, priceText }) => {
    const parts: string[] = [
      `Glavna ključna beseda: „${template.primaryKeyword}"`,
      `Kategorija: ${template.category}`,
      `Slug: ${template.slug}`,
      `Namen: ${template.intent}`,
    ];
    if (template.occasionId) parts.push(`ID priložnosti: ${template.occasionId}`);
    if (template.voiceId) parts.push(`ID glasu: ${template.voiceId}`);
    if (template.styleId) parts.push(`ID sloga: ${template.styleId}`);
    parts.push(`Znamka: ${brand}`);
    parts.push(`Locale: ${locale} (${langName})`);
    parts.push(`Cena: ${priceText}`);
    parts.push(`Studio URL: /studio`);
    parts.push(``);
    parts.push(`Generiraj JSON objekt zdaj.`);
    return parts.join('\n');
  },
  bs: ({ template, brand, locale, langName, priceText }) => {
    const parts: string[] = [
      `Glavna ključna riječ: „${template.primaryKeyword}"`,
      `Kategorija: ${template.category}`,
      `Slug: ${template.slug}`,
      `Namjera: ${template.intent}`,
    ];
    if (template.occasionId) parts.push(`ID prilike: ${template.occasionId}`);
    if (template.voiceId) parts.push(`ID glasa: ${template.voiceId}`);
    if (template.styleId) parts.push(`ID stila: ${template.styleId}`);
    parts.push(`Brend: ${brand}`);
    parts.push(`Locale: ${locale} (${langName})`);
    parts.push(`Cijena: ${priceText}`);
    parts.push(`Studio URL: /studio`);
    parts.push(``);
    parts.push(`Generiši JSON objekat sada.`);
    return parts.join('\n');
  },
  sq: ({ template, brand, locale, langName, priceText }) => {
    const parts: string[] = [
      `Fjalë kyçe kryesore: „${template.primaryKeyword}"`,
      `Kategoria: ${template.category}`,
      `Slug: ${template.slug}`,
      `Qëllimi: ${template.intent}`,
    ];
    if (template.occasionId) parts.push(`ID e rastit: ${template.occasionId}`);
    if (template.voiceId) parts.push(`ID e zërit: ${template.voiceId}`);
    if (template.styleId) parts.push(`ID e stilit: ${template.styleId}`);
    parts.push(`Marka: ${brand}`);
    parts.push(`Locale: ${locale} (${langName})`);
    parts.push(`Çmimi: ${priceText}`);
    parts.push(`Studio URL: /studio`);
    parts.push(``);
    parts.push(`Gjenero tani objektin JSON.`);
    return parts.join('\n');
  },
  mk: ({ template, brand, locale, langName, priceText }) => {
    const parts: string[] = [
      `Главен клучен збор: „${template.primaryKeyword}"`,
      `Категорија: ${template.category}`,
      `Slug: ${template.slug}`,
      `Намера: ${template.intent}`,
    ];
    if (template.occasionId) parts.push(`ID на пригода: ${template.occasionId}`);
    if (template.voiceId) parts.push(`ID на глас: ${template.voiceId}`);
    if (template.styleId) parts.push(`ID на стил: ${template.styleId}`);
    parts.push(`Бренд: ${brand}`);
    parts.push(`Locale: ${locale} (${langName})`);
    parts.push(`Цена: ${priceText}`);
    parts.push(`Studio URL: /studio`);
    parts.push(``);
    parts.push(`Генерирај го JSON објектот сега.`);
    return parts.join('\n');
  },
  hu: ({ template, brand, locale, langName, priceText }) => {
    const parts: string[] = [
      `Fő kulcsszó: „${template.primaryKeyword}"`,
      `Kategória: ${template.category}`,
      `Slug: ${template.slug}`,
      `Szándék: ${template.intent}`,
    ];
    if (template.occasionId) parts.push(`Alkalom ID: ${template.occasionId}`);
    if (template.voiceId) parts.push(`Hang ID: ${template.voiceId}`);
    if (template.styleId) parts.push(`Stílus ID: ${template.styleId}`);
    parts.push(`Márka: ${brand}`);
    parts.push(`Locale: ${locale} (${langName})`);
    parts.push(`Ár: ${priceText}`);
    parts.push(`Studio URL: /studio`);
    parts.push(``);
    parts.push(`Generáld most a JSON objektumot.`);
    return parts.join('\n');
  },
  en: ({ template, brand, locale, langName, priceText }) => {
    const parts: string[] = [
      `Primary keyword: "${template.primaryKeyword}"`,
      `Category: ${template.category}`,
      `Slug (for /articole/<slug>): ${template.slug}`,
      `Intent: ${template.intent}`,
    ];
    if (template.occasionId) parts.push(`Occasion ID on site: ${template.occasionId}`);
    if (template.voiceId) parts.push(`Voice ID on site: ${template.voiceId}`);
    if (template.styleId) parts.push(`Music style ID on site: ${template.styleId}`);
    parts.push(`Brand: ${brand}`);
    parts.push(`Locale: ${locale} (${langName})`);
    parts.push(`Price: ${priceText}`);
    parts.push(`Studio URL (for CTAs): /studio`);
    parts.push(``);
    parts.push(`Generate the JSON object now.`);
    return parts.join('\n');
  },
};

// Directiva care apare la ÎNCEPUTUL user prompt-ului pentru locale ≠ ro:
// forțează modelul să traducă keyword-ul (care vine în română) într-un
// echivalent nativ idiomatic și să-l folosească peste tot. Fără asta, modelul
// păstrează prefixul românesc as-is.
const TRANSLATE_DIRECTIVE_BY_LOCALE: Record<string, (lang: string) => string> = {
  bg: (lang) => [
    `ВАЖНО: „Основната ключова дума" по-долу е дадена на РУМЪНСКИ като seed.`,
    `ТРЯБВА да я преведеш в естествен, идиоматичен ${lang} еквивалент и да`,
    `използваш ПРЕВЕДЕНАТА версия в title, h1, metaDescription, excerpt и`,
    `целия contentMd. НЕ оставяй румънски думи в крайния резултат.`,
  ].join('\n'),
  sr: (lang) => [
    `VAŽNO: „Glavna ključna reč" ispod je data na RUMUNSKOM kao seed.`,
    `MORAŠ je prevesti u prirodan, idiomatičan ${lang} ekvivalent i koristiti`,
    `PREVEDENU verziju u title, h1, metaDescription, excerpt i celom contentMd.`,
    `NE ostavljaj rumunske reči u finalnom rezultatu.`,
  ].join('\n'),
  tr: (lang) => [
    `ÖNEMLİ: Aşağıdaki „Ana anahtar kelime" tohum olarak ROMENCE verilmiştir.`,
    `Onu doğal, deyimsel ${lang} karşılığına ÇEVİRMELİSİN ve ÇEVRİLMİŞ versiyonu`,
    `title, h1, metaDescription, excerpt ve tüm contentMd'de kullanmalısın.`,
    `Sonuçta Romence kelime BIRAKMA.`,
  ].join('\n'),
  el: (lang) => [
    `ΣΗΜΑΝΤΙΚΟ: Η „Κύρια λέξη-κλειδί" παρακάτω δίνεται στα ΡΟΥΜΑΝΙΚΑ ως seed.`,
    `ΠΡΕΠΕΙ να τη μεταφράσεις σε φυσικό, ιδιωματικό ${lang} ισοδύναμο και να`,
    `χρησιμοποιήσεις τη ΜΕΤΑΦΡΑΣΜΕΝΗ έκδοση σε title, h1, metaDescription, excerpt`,
    `και ολόκληρο το contentMd. ΜΗΝ αφήσεις ρουμανικές λέξεις στο τελικό αποτέλεσμα.`,
  ].join('\n'),
  hr: (lang) => [
    `VAŽNO: „Glavna ključna riječ" ispod je dana na RUMUNJSKOM kao seed.`,
    `MORAŠ je prevesti u prirodan, idiomatičan ${lang} ekvivalent i koristiti`,
    `PREVEDENU verziju u title, h1, metaDescription, excerpt i cijelom contentMd.`,
    `NE ostavljaj rumunjske riječi u konačnom rezultatu.`,
  ].join('\n'),
  sl: (lang) => [
    `POMEMBNO: „Glavna ključna beseda" spodaj je podana v ROMUNŠČINI kot seed.`,
    `MORAŠ jo prevesti v naraven, idiomatičen ${lang} ekvivalent in uporabiti`,
    `PREVEDENO različico v title, h1, metaDescription, excerpt in celotnem contentMd.`,
    `NE puščaj romunskih besed v končnem rezultatu.`,
  ].join('\n'),
  bs: (lang) => [
    `VAŽNO: „Glavna ključna riječ" ispod je data na RUMUNSKOM kao seed.`,
    `MORAŠ je prevesti u prirodan, idiomatičan ${lang} ekvivalent i koristiti`,
    `PREVEDENU verziju u title, h1, metaDescription, excerpt i cijelom contentMd.`,
    `NE ostavljaj rumunske riječi u konačnom rezultatu.`,
  ].join('\n'),
  sq: (lang) => [
    `E RËNDËSISHME: „Fjala kyçe kryesore" më poshtë është dhënë në RUMANISHT si seed.`,
    `DUHET ta përkthesh në një ekuivalent natyror, idiomatik ${lang} dhe të përdorësh`,
    `versionin e PËRKTHYER në title, h1, metaDescription, excerpt dhe gjithë contentMd.`,
    `MOS lër fjalë rumune në rezultatin përfundimtar.`,
  ].join('\n'),
  mk: (lang) => [
    `ВАЖНО: „Главниот клучен збор" подолу е даден на РУМУНСКИ како seed.`,
    `МОРАШ да го преведеш во природен, идиоматски ${lang} еквивалент и да`,
    `го користиш ПРЕВЕДЕНИОТ во title, h1, metaDescription, excerpt и целиот contentMd.`,
    `НЕ оставај романски зборови во крајниот резултат.`,
  ].join('\n'),
  hu: (lang) => [
    `FONTOS: Az alábbi „Fő kulcsszó" ROMÁNUL van megadva seedként.`,
    `LE KELL fordítanod természetes, idiomatikus ${lang} megfelelőre, és a`,
    `LEFORDÍTOTT verziót kell használnod a title, h1, metaDescription, excerpt és`,
    `az egész contentMd mezőben. NE hagyj román szavakat a végső kimenetben.`,
  ].join('\n'),
  en: (lang) => [
    `IMPORTANT: The "Primary keyword" below is given in ROMANIAN as a seed.`,
    `You MUST translate it into a natural, idiomatic ${lang} equivalent and use`,
    `the TRANSLATED version in title, h1, metaDescription, excerpt and the entire`,
    `contentMd. Do NOT leave any Romanian words in the final output.`,
  ].join('\n'),
};

// ─────────────────────────────────────────────────────────────────────────────
// Slug normalization + per-locale slug instructions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalizează slug-ul venit de la model: lower-case, fără diacritice,
 * transliterare cirilic→latin pentru bg/sr/mk, grec→latin pentru el, păstrează
 * doar [a-z0-9-], lungime max 80. Returnează string gol dacă output-ul e
 * inutilizabil — caller-ul va cădea pe master-slug.
 */
function normalizeSlug(input: string): string {
  if (!input) return '';
  let s = input.trim().toLowerCase();
  // transliteration tables (caractere obișnuite în limbi suportate)
  const TRANSLIT: Record<string, string> = {
    // bg / mk / sr (cirilic) → latin
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
    'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f',
    'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sht', 'ъ': 'a',
    'ь': '', 'ю': 'yu', 'я': 'ya',
    'ѓ': 'gj', 'ѕ': 'dz', 'ј': 'j', 'љ': 'lj', 'њ': 'nj', 'ќ': 'kj',
    'џ': 'dj', 'ђ': 'dj', 'ћ': 'c',
    // greacă → latin
    'α': 'a', 'β': 'v', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'i',
    'θ': 'th', 'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x',
    'ο': 'o', 'π': 'p', 'ρ': 'r', 'σ': 's', 'ς': 's', 'τ': 't', 'υ': 'y',
    'φ': 'f', 'χ': 'ch', 'ψ': 'ps', 'ω': 'o',
    // turcă
    'ı': 'i', 'ğ': 'g', 'ş': 's', 'ç': 'c', 'ü': 'u', 'ö': 'o',
    // hr/sl/bs/sq/ro (ş e deja mapat în secțiunea turcă mai sus)
    'č': 'c', 'ć': 'c', 'đ': 'd', 'š': 's', 'ž': 'z',
    'ă': 'a', 'â': 'a', 'î': 'i', 'ț': 't',
    'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ő': 'o', 'ű': 'u',
    'ë': 'e',
  };
  let out = '';
  for (const ch of s) {
    out += TRANSLIT[ch] ?? ch;
  }
  // strip Unicode decomposition for orice rămas (NFD + diacritics)
  out = out.normalize('NFD').replace(/[̀-ͯ]/g, '');
  out = out.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return out.slice(0, 80);
}

const SLUG_DIRECTIVE_BY_LOCALE: Record<string, (lang: string, masterSlug: string) => string> = {
  ro: (_lang, masterSlug) => [
    `SLUG: include în JSON câmpul "slug" cu valoarea exactă: "${masterSlug}".`,
  ].join('\n'),
  bg: (lang, _masterSlug) => [
    `СЛУГ: включи в JSON-а поле „slug" — кратък URL slug на ${lang}, ТРАНСЛИТЕРИРАН`,
    `на ЛАТИНИЦА (без кирилица), kebab-case, само [a-z0-9-], малки букви, без`,
    `диакритика, без специални символи, максимум 60 знака. Slug-ът трябва да`,
    `отразява основната ключова дума на български (транслитерирана). Пример:`,
    `за „чалга подарък рожден ден" → "chalga-podaruk-rozhden-den".`,
  ].join('\n'),
  sr: (lang, _) => [
    `SLUG: uključi u JSON polje „slug" — kratak URL slug na ${lang}, kebab-case,`,
    `samo [a-z0-9-], mala slova, bez dijakritike, latinica (ne ćirilica),`,
    `maksimum 60 znakova, koji reflektuje glavnu ključnu reč.`,
  ].join('\n'),
  tr: (lang, _) => [
    `SLUG: JSON'a "slug" alanı ekle — ${lang} kısa URL slug'ı, kebab-case,`,
    `sadece [a-z0-9-], küçük harfler, Türkçe karakterler latin'e dönüştürülmüş`,
    `(ı→i, ğ→g, ş→s, ç→c, ü→u, ö→o), maksimum 60 karakter, ana anahtar kelimeyi`,
    `yansıtan.`,
  ].join('\n'),
  el: (lang, _) => [
    `SLUG: συμπερίλαβε στο JSON πεδίο „slug" — σύντομο URL slug στα ${lang},`,
    `ΜΕΤΑΓΡΑΜΜΑΤΙΣΜΕΝΟ σε ΛΑΤΙΝΙΚΟΥΣ χαρακτήρες (όχι ελληνικούς), kebab-case,`,
    `μόνο [a-z0-9-], πεζά, χωρίς τόνους, μέγιστο 60 χαρακτήρες, που αντικατοπτρίζει`,
    `την κύρια λέξη-κλειδί στα ελληνικά (μεταγραμματισμένη).`,
  ].join('\n'),
  hr: (lang, _) => [
    `SLUG: uključi u JSON polje „slug" — kratak URL slug na ${lang}, kebab-case,`,
    `samo [a-z0-9-], mala slova, bez dijakritike (č→c, ć→c, š→s, ž→z, đ→d),`,
    `maksimum 60 znakova.`,
  ].join('\n'),
  sl: (lang, _) => [
    `SLUG: vključi v JSON polje „slug" — kratek URL slug v ${lang}, kebab-case,`,
    `samo [a-z0-9-], male črke, brez šumnikov (č→c, š→s, ž→z), max 60 znakov.`,
  ].join('\n'),
  bs: (lang, _) => [
    `SLUG: uključi u JSON polje „slug" — kratak URL slug na ${lang}, kebab-case,`,
    `samo [a-z0-9-], mala slova, bez dijakritike, max 60 znakova.`,
  ].join('\n'),
  sq: (lang, _) => [
    `SLUG: përfshi në JSON fushën „slug" — slug i shkurtër URL në ${lang},`,
    `kebab-case, vetëm [a-z0-9-], shkronja të vogla, pa ë/ç (ë→e, ç→c), max 60 karaktere.`,
  ].join('\n'),
  mk: (lang, _) => [
    `СЛУГ: вклучи во JSON поле „slug" — краток URL slug на ${lang}, ТРАНСЛИТЕРИРАН`,
    `на ЛАТИНИЦА (не кирилица), kebab-case, само [a-z0-9-], мали букви, max 60.`,
  ].join('\n'),
  hu: (lang, _) => [
    `SLUG: vegyél fel a JSON-ba egy „slug" mezőt — rövid URL slug ${lang}ul,`,
    `kebab-case, csak [a-z0-9-], kisbetűs, ékezetek nélkül (á→a, é→e, í→i, ó→o,`,
    `ö→o, ő→o, ú→u, ü→u, ű→u), maximum 60 karakter.`,
  ].join('\n'),
  en: (lang, _) => [
    `SLUG: include in the JSON a "slug" field — short URL slug in ${lang},`,
    `kebab-case, only [a-z0-9-], lowercase, ASCII (no diacritics), max 60 chars,`,
    `reflecting the primary keyword in the target language.`,
  ].join('\n'),
};
