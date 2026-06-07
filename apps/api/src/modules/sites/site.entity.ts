import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface SiteBrand {
  primaryColor?: string;
  accentColor?: string;
  logoUrl?: string;
  ogImageUrl?: string;
  tagline?: string;
  faviconUrl?: string;
  /** Banner 600x200px folosit în headerul email-urilor tranzacționale.
   *  Dacă lipsește, template-ul folosește logoUrl (dacă există) sau bannerul
   *  default Manele Cadou de pe site-ul mamă. */
  emailBannerUrl?: string;
}

export interface SiteSeo {
  title?: string;
  description?: string;
  keywords?: string;
}

export interface SiteAnalytics {
  ga4Id?: string;
  metaPixelId?: string;
  tiktokPixelId?: string;
  /** ID-ul contului de ads Meta (partea numerică din `act_1234567890`). Folosit de
   *  Marketing API pentru a trage spend-ul defalcat pe campanie. */
  metaAdAccountId?: string;
  /** Advertiser ID TikTok (din Ads Manager). Folosit de Marketing API reporting. */
  tiktokAdvertiserId?: string;
}

/**
 * Token-uri / secrete pentru integrarea server-side (Events API, Measurement
 * Protocol, CAPI). NU sunt expuse prin `/api/public/site` — doar admin le vede
 * și API-ul le citește pentru a apela TikTok / Meta / GA din webhook-uri.
 */
export interface SiteAnalyticsSecrets {
  /** TikTok Events API access token (din Events Manager → Settings → Generate). */
  tiktokAccessToken?: string;
  /** GA4 Measurement Protocol API secret (din GA4 → Data Streams → Measurement Protocol). */
  ga4ApiSecret?: string;
  /** Meta Conversions API access token (din Events Manager → Settings). */
  metaCapiToken?: string;
  /** Meta test event code (din Events Manager → Test events). Opțional, doar pentru
   *  debug — când e setat, evenimentele ajung în „Test events" tab în loc de
   *  reporting normal. Șterge după ce confirmi că vin. */
  metaTestEventCode?: string;
  /** Meta Marketing API token (System User token cu scope `ads_read`, din Business
   *  Settings → System Users → Generate Token). Citește spend-ul de campanie. Token
   *  de system user nu expiră. Separat de `metaCapiToken` (Conversions API). */
  metaMarketingToken?: string;
  /** TikTok Marketing API access token (din TikTok for Business → app aprobat pentru
   *  Reporting). Citește spend-ul de campanie. Separat de `tiktokAccessToken` (Events API). */
  tiktokMarketingToken?: string;
}

export interface SiteStripe {
  // Toate site-urile folosesc același cont Stripe (un singur SECRET_KEY global).
  // Aici stocăm doar configurația per-site (preț + metadata de raportare).
  priceId?: string | null; // dacă vrei un Stripe Price preconfigurat, altfel folosim price_data dinamic
  productName?: string; // ce apare în statementul Stripe + factură
  statementDescriptor?: string; // max 22 chars, ce vede clientul pe extras
}

export interface SiteSocial {
  instagram?: string; // URL complet
  facebook?: string;
  tiktok?: string;
  youtube?: string;
  whatsapp?: string; // URL gen wa.me/40123...
  phone?: string; // ex: '+40 758 972 277'
}

/**
 * Configurare email per-site: din ce provider (Mailgun / SMTP) se trimit
 * mailurile (login, gift, confirmări, etc.) și cu ce credențiale. Câmpurile
 * sensibile (`mailgun.apiKey`, `smtp.pass`) sunt stocate criptate cu
 * `encryptSecret()` (AES-256-GCM, cheia din env `MAIL_CRED_KEY`).
 *
 * Dacă `provider` e null/undefined, mailerul cade pe configul GLOBAL din
 * SettingsService (env / settings table) — comportamentul anterior, pentru
 * compatibilitate.
 */
export interface SiteMailConfig {
  /** 'mailgun' | 'smtp' | null. Null = folosește configul global. */
  provider?: 'mailgun' | 'smtp' | null;
  /** Adresa expeditor (ex. `noreply@chalgapodarok.bg`). */
  fromEmail?: string;
  /** Numele afișat lângă adresă (ex. „ЧалгаПодарък"). */
  fromName?: string;
  /** Reply-To opțional. */
  replyTo?: string;
  /** Configurare Mailgun. */
  mailgun?: {
    /** CRIPTAT cu encryptSecret(). */
    apiKey?: string;
    domain?: string;
    region?: 'eu' | 'us';
    apiUrl?: string;
  };
  /** Configurare SMTP. */
  smtp?: {
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    /** CRIPTAT cu encryptSecret(). */
    pass?: string;
  };
}

export interface SiteCompanyInfo {
  legalName?: string; // ex: "Manele Cadou SRL"
  cui?: string; // ex: "RO12345678"
  regCom?: string; // ex: "J40/12345/2024"
  address?: string; // adresa fiscală
  iban?: string;
  ownerName?: string;
}

/**
 * Datele de client folosite la emiterea unei facturi SmartBill. Pentru
 * neplătitor TVA, clienții persoane fizice au de obicei doar nume (+ opțional
 * CNP). `vatCode` ține CUI (firme) sau CNP (persoane fizice).
 */
export interface SiteSmartbillClient {
  name?: string;
  vatCode?: string; // CUI sau CNP
  regCom?: string;
  address?: string;
  city?: string;
  county?: string;
  country?: string; // default "Romania"
  email?: string;
  /** Plătitor de TVA? Pentru persoane fizice / neplătitori → false. */
  isTaxPayer?: boolean;
}

/**
 * Configurare facturare SmartBill per-site. Tokenul e CRIPTAT la repaus cu
 * `encryptSecret()` (cheia din env `MAIL_CRED_KEY`, la fel ca mailConfig).
 *
 * Firma e NEPLĂTITOARE de TVA → produsele se emit cu `taxPercentage: 0`, iar
 * `companyVatCode` e CIF-ul fără prefixul „RO".
 */
export interface SiteSmartbill {
  /** Dacă false/undefined, butoanele de emitere sunt dezactivate pentru site. */
  enabled?: boolean;
  /** Emailul contului SmartBill (username la Basic auth). */
  email?: string;
  /** Tokenul API SmartBill. CRIPTAT cu encryptSecret(). */
  token?: string;
  /** CIF-ul firmei tale (fără „RO" pentru neplătitor TVA). */
  companyVatCode?: string;
  /** Seria facturilor configurată în SmartBill (ex. „MNL"). */
  seriesName?: string;
  /** Seria încasărilor/chitanțelor (ex. „PLATA_MEL"). Folosită pe `payment.paymentSeries`. */
  paymentSeriesName?: string;
  /** Unitate de măsură pe linia de produs. Default „buc". */
  measuringUnit?: string;
  /** Denumirea serviciului pe factură. Ex. „Melodie personalizată". */
  productName?: string;
  /** Tip plată folosit pe încasarea embedded. Default „Card". */
  paymentType?: string;
  /** Dacă true, emiterea folosește `defaultClient` în loc de cumpărătorul real. */
  useDefaultClient?: boolean;
  /** Clientul implicit (ex. persoana ta fizică) folosit la facturile istorice. */
  defaultClient?: SiteSmartbillClient;
}

export interface SiteSuno {
  // === Suno style tags (audio generation) ===
  // Promptul de bază pentru Suno (overwrites buildStyleTag default behavior)
  basePrompt?: string;
  // Override per-stil (cheie = style slug, valoare = tag-uri Suno)
  stylePromptMap?: Record<string, string>;

  // === OpenAI lyrics writer (replaces default Romanian-centric system prompt) ===
  /**
   * System prompt complet pentru OpenAI writer, în limba site-ului. Dacă e
   * setat, înlocuiește system prompt-ul default (gândit pentru manele românești).
   * Folosește când vrei vocabular, atitudine și sub-genuri NATIVE (ex. chalga
   * pentru BG, turbofolk pentru RS, arabesk pentru TR). Lasă gol = fallback RO.
   */
  writerSystemPrompt?: string;
  /**
   * User prompt template pentru writer. Conține placeholders `{{style}}`,
   * `{{occasion}}`, `{{recipientName}}`, `{{senderName}}`, `{{tipAmount}}`,
   * `{{currency}}`, `{{message}}`, `{{voiceArtist}}`, `{{styleHint}}`. Gol =
   * fallback la template-ul default RO din `lyrics.module.ts`.
   */
  writerUserTemplate?: string;
  /**
   * System prompt pentru OpenAI critic. La fel — gol = fallback RO.
   */
  criticSystemPrompt?: string;
  /**
   * User prompt template pentru critic. Aceleași placeholders ca writer + `{{draft}}`.
   * Gol = fallback la default.
   */
  criticUserTemplate?: string;
  // Voice mapping per-site (dacă vrei voci diferite pe BG vs RO)
  voiceMap?: Record<string, string>;
  // Limba lyricsului (default = locale-ul site-ului)
  lyricsLocale?: string;

  /** Mostre audio per stil — URL public (S3, MinIO, sau uploads/). */
  styleSamples?: Record<string, SiteSampleEntry>;
  /** Mostre audio per voce. Aceeași structură. */
  voiceSamples?: Record<string, SiteSampleEntry>;
}

export interface SiteSampleEntry {
  audioUrl: string;
  generatedAt: string; // ISO date
  sunoTaskId?: string;
  /** AudioId returnat de Suno pe track-ul ales. Necesar pentru a putea
   *  crea ulterior un Persona din această mostră. */
  sunoAudioId?: string;
  /** Secunda de la care începe playback-ul în UI (skip intro). Default 0. */
  startSec?: number;
}

/**
 * Intrare curată manual pentru „Topul săptămânii" când `topSource='template'`.
 * Sursa audio e o mostră existentă (stil sau voce) din `suno.styleSamples` /
 * `suno.voiceSamples`, rezolvată după `kind` + `key`. Adminul alege exact ce
 * apare, în ce ordine, cu ce titlu/artist și câte vizualizări afișate.
 */
export interface SiteTopTemplateItem {
  /** Din ce pool de audio vine track-ul:
   *  - 'style' → suno.styleSamples[key]
   *  - 'voice' → suno.voiceSamples[key]
   *  - 'demo'  → site_demos.id === key (melodiile din „Ascultă exemple") */
  kind: 'style' | 'voice' | 'demo';
  /** Cheia care rezolvă audioUrl-ul: id stil / id voce / id site-demo. */
  key: string;
  /** Titlu afișat (ex. „Manea pentru Costel șeful"). */
  title: string;
  /** Artist / interpret afișat. */
  artist: string;
  /** Vizualizări afișate (placeholder „aspirațional"). */
  views: number;
  /** Secunda de la care pornește redarea (skip intro). Default 0. */
  startSec?: number;
  /** Dacă setat > 0, redarea se limitează la atâtea secunde de la `startSec`
   *  (preview scurt). Dacă lipsește / 0 → redă toată melodia de la `startSec`. */
  previewSec?: number;
}

/**
 * Default-uri persistate pentru formularul „Personalizează mostra" din admin.
 * Salvate per-entry (stil sau voce) la apăsarea „Salvează modificările" —
 * la reîncărcare, formularul se completează cu ultimele valori folosite.
 *
 * NU se exportă în public/site, NU influențează generatorul user-facing —
 * sunt strict pentru a păstra context-ul admin între sesiuni.
 */
export interface SiteSampleDefaults {
  recipient?: string;
  dedication?: string;
  message?: string;
  /** Cheia ocaziei (id din site.occasions). */
  occasion?: string;
  tipAmount?: number;
  premium?: boolean;
  /** Cheia stilului — folosit doar la mostra de voce. */
  style?: string;
  /** Cheia vocii — folosit doar la mostra de stil. */
  voice?: string;
  /** Override vocalGender pentru mostră. */
  gender?: 'm' | 'f';
  /** Hint AI pentru lyrics writer (override la lyricsHint default de pe stil). */
  aiHint?: string;
  /** Prompt Suno temporar (override la sunoPrompt default de pe stil). */
  sunoPromptDraft?: string;
  /** Versuri custom (cu Suno tags). Dacă e setat, sare peste lyrics auto. */
  lyrics?: string;
}

/**
 * Stil muzical configurabil per-site. `id` = cheia stabilă folosită în URL-uri
 * și mostre audio (nu se schimbă după ce e setată). Restul câmpurilor sunt
 * pentru afișare + integrarea cu Suno/OpenAI.
 */
/** Configurare icoană SVG (Lucide) pentru o categorie. */
export interface SiteIconConfig {
  name: string;        // PascalCase, ex: "Music2", "Heart"
  fill?: string;       // culoare fill, ex: "none", "#ff6b6b"
  stroke?: string;     // culoare stroke, ex: "currentColor", "#ff6b6b"
  strokeWidth?: number; // grosime contur, ex: 1.5, 2, 2.5
}

export interface SiteStyleEntry {
  id: string;
  em: string; // emoji / icon (ex. "🎻") — fallback dacă `ic` nu e setat
  nm: string; // nume default (folosit dacă nu e i18n.nm pe locale-ul curent)
  ds: string; // descriere default
  heat?: string; // badge opțional ("🔥 #1", "🔥 hot", "🔥 new", etc.)
  /** Icoană SVG configurabilă (override față de emoji `em`). */
  ic?: SiteIconConfig;
  /** Override traduceri per locale. Cheia = locale ("ro", "bg", ...). */
  i18n?: Record<string, { nm?: string; ds?: string; heat?: string }>;
  /** Override prompt Suno pentru acest stil (se pune în suno.stylePromptMap). */
  sunoPrompt?: string;
  /** Hint scurt pentru writer-ul OpenAI — pre-completează „Hint AI pentru versuri"
   *  în UI-ul de sample generation. Ex: „manea de jale, vocabular cu lacrimi/inimă". */
  lyricsHint?: string;
  /** Cât de strict urmează Suno tag-urile de style (0..1). Default Suno ~0.5.
   *  Pentru manele unde vrem fidelitate ridicată la sub-genre → 0.7-0.9. */
  styleWeight?: number;
  /** Cât de creativ / deviant e modelul (0..1). Pentru genuri tradiționale → mic
   *  (0.1-0.3); pentru experimentale (trapanele, tallava) → mai mare. */
  weirdnessConstraint?: number;
  /** Tag-uri / genuri de exclus, CSV. Ex: "pop, EDM, trap-rap, rap". Mai eficient
   *  decât a scrie „NOT pop" în prompt-ul pozitiv. */
  negativeTags?: string;
  /** Default-uri persistate pentru formularul „Personalizează mostra" din admin. */
  sampleDefaults?: SiteSampleDefaults;
}

export interface SiteVoiceEntry {
  id: string;
  nm: string;
  tg: string; // tagline scurt
  av: string; // inițiale avatar (2 caractere)
  /** Icoană SVG configurabilă (override față de inițialele avatar). */
  ic?: SiteIconConfig;
  i18n?: Record<string, { nm?: string; tg?: string }>;
  /** Override voice mapping pentru Suno (cheia ajunge în suno.voiceMap). */
  sunoVoice?: string;
  /** Sex vocal — trimis ca `vocalGender: 'm'|'f'` în request-ul Suno. Garantează
   *  genul vocii (Suno acceptă nativ acest parametru, nu mai depindem de
   *  descriptori în prompt). Gol = lăsăm Suno să decidă. */
  gender?: 'm' | 'f';
  /** PersonaId returnat de Suno `/generate/generate-persona`. Când e setat,
   *  se trimite ca `personaId` la generare → consistență voce/stil cross-piese. */
  sunoPersonaId?: string;
  /** Numele afișat al persona-ului (pentru a-l identifica în admin). */
  sunoPersonaName?: string;
  /** TaskId-ul mostrei sursă din care s-a generat persona — pentru audit. */
  sunoPersonaSourceTaskId?: string;
  /** AudioId-ul mostrei sursă — Suno limitează la 1 persona per audioId. */
  sunoPersonaSourceAudioId?: string;
  /** Data generării persona-ului (ISO). */
  sunoPersonaCreatedAt?: string;
  /** Default-uri persistate pentru formularul „Personalizează mostra" din admin. */
  sampleDefaults?: SiteSampleDefaults;
}

export interface SiteOccasionEntry {
  id: string;
  em: string;
  nm: string;
  /** Icoană SVG configurabilă (override față de emoji `em`). */
  ic?: SiteIconConfig;
  i18n?: Record<string, { nm?: string }>;
}

/**
 * Testimonial afișat pe pagina principală (secțiunea „Ce zic clienții"). Editabil
 * din admin per-site. Default = `[]`; web app cade pe lista hardcoded din
 * `seed-data.ts` (TESTI) dacă acest array e gol.
 */
export interface SiteTestimonialEntry {
  /** ID stabil (uuid sau slug) — folosit ca React key. */
  id: string;
  /** 1..5. Afișat ca `★` repetat. */
  stars: number;
  /** Textul recenziei. */
  quote: string;
  /** Numele afișat (ex. „Costel B."). */
  name: string;
  /** Rol / locație (ex. „Buzău", „client din 2024"). */
  role: string;
  /** 1-3 caractere afișate ca avatar (ex. „CB"). */
  avatar: string;
  /** Override traduceri per locale. Cheia = locale ("ro", "bg", ...). */
  i18n?: Record<string, { quote?: string; name?: string; role?: string }>;
}

@Entity({ name: 'sites' })
export class Site {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  slug!: string; // ex. "ro", "ro2", "bg", "rs", folosit ca prefix metadata Stripe

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 253 })
  domain!: string; // ex. "manelecadou.ro" — UNIQUE — folosit de Caddy /ask

  @Column({ type: 'varchar', length: 120 })
  name!: string; // brand display name, ex. "Manele Cadou"

  @Column({ type: 'varchar', length: 8, default: 'ro' })
  locale!: string; // ro|bg|rs|tr|el|hr|sl|bs|sq|mk|hu|en — UNA per site

  @Column({ type: 'varchar', length: 8, default: 'RON' })
  currency!: string; // RON|EUR|BGN|RSD|TRY|HUF...

  @Column({ type: 'integer', default: 2999 })
  basePriceCents!: number; // preț de bază în cele mai mici unități ale monedei (29.99 lei default)

  /** Prețul „standard" (sub formă de strikethrough în vitrine — de unde se
   *  reduce). Marketing/anchoring. 0 = nu se afișează preț strikethrough. */
  @Column({ type: 'integer', default: 4999 })
  standardPriceCents!: number;

  /** Suprataxă fixă pentru Manea Premium (audio mai bun). Default 20 lei. */
  @Column({ type: 'integer', default: 2000 })
  premiumExtraCents!: number;

  /** Plafonul de suprataxă pentru dedicație (cap). Default 50 lei. */
  @Column({ type: 'integer', default: 5000 })
  tipSurchargeCapCents!: number;

  /** Procentul de suprataxă din suma dedicației (0–100). Default 5. */
  @Column({ type: 'integer', default: 5 })
  tipSurchargePercent!: number;

  @Column({ type: 'integer', default: 0 })
  giftPriceCents!: number; // preț cod cadou single

  /**
   * Override per-site al prețurilor de pachet (cents, în valuta site-ului).
   * Cheie = tier ('basic'|'plus'|'premium'). Lipsa unei chei → fallback la
   * prețul default din `PACKAGES` (vezi payments/packages.ts). NULL = toate
   * tier-urile pe default. Synchronize-safe (jsonb nullable).
   */
  @Column({ type: 'jsonb', nullable: true })
  packagePricesCents!: Partial<Record<'basic' | 'plus' | 'premium', number>> | null;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  brand!: SiteBrand;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  seo!: SiteSeo;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  analytics!: SiteAnalytics;

  /** Token-uri server-side pentru tracking (TikTok Events API, GA4 Measurement
   *  Protocol, Meta CAPI). Server-only — NU se serializează în public/site. */
  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  analyticsSecrets!: SiteAnalyticsSecrets;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  stripe!: SiteStripe;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  suno!: SiteSuno;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  social!: SiteSocial;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  companyInfo!: SiteCompanyInfo;

  /**
   * Configurare facturare SmartBill (token criptat, CIF, serie, client implicit).
   * Server-only — NU se serializează în public/site. Vezi `SiteSmartbill`.
   */
  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  smartbill!: SiteSmartbill;

  /**
   * Configurare email per-site (provider + credențiale + from/name). Secretele
   * sunt criptate la repaus. Vezi `SiteMailConfig`.
   */
  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  mailConfig!: SiteMailConfig;

  @Column({ type: 'varchar', length: 320, nullable: true })
  fromEmail!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  supportEmail!: string | null;

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  adminEmails!: string[];

  @Column({ type: 'boolean', default: true })
  active!: boolean; // dacă false, Caddy /ask refuză + web returnează 503

  @Column({ type: 'boolean', default: false })
  isDefault!: boolean; // fallback pentru request-uri pe Host necunoscut (rar — doar dev)

  @Column({ type: 'boolean', default: true })
  sslEnabled!: boolean; // permite Caddy să emită cert pentru domeniu

  @Column({ type: 'boolean', default: false })
  maintenanceMode!: boolean;

  @Column({ type: 'boolean', default: false })
  hiddenMode!: boolean; // dacă true, Caddy/Next.js închid conexiunea cu 444 (ERR_EMPTY_RESPONSE)

  /**
   * Modul AI default pentru conversații noi pe acest site (override global
   * AI_CHAT_MODE_DEFAULT). NULL → folosește setarea globală. Valori:
   *  - 'manual'  → AI nu intervine (default safe)
   *  - 'suggest' → AI propune răspunsuri, admin aprobă
   *  - 'auto'    → AI răspunde direct cu guardrails
   */
  @Column({ type: 'varchar', length: 16, nullable: true })
  aiChatModeDefault!: 'manual' | 'suggest' | 'auto' | null;

  /**
   * Dacă true, AI-ul Irina trimite proactiv salutul către vizitatori după
   * `aiGreetingDelaySec`. Anti-spam: doar dacă conv n-are `greetingSentAt`.
   * Skip pe pagina `/m/[id]` (ascultători nu-s prospects).
   */
  @Column({ type: 'boolean', default: false })
  aiGreetingEnabled!: boolean;

  /**
   * Câte secunde așteaptă AI-ul după conectarea WS înainte să trimită salutul.
   * Default 5s. Range util: 3-30s. Folosit doar dacă aiGreetingEnabled=true.
   */
  @Column({ type: 'integer', default: 5 })
  aiGreetingDelaySec!: number;

  /**
   * Dacă true, când AI-ul trimite salutul, chat-ul se deschide automat pe ecranul
   * vizitatorului (force_open via WS). Dacă false, salutul ajunge dar widget-ul
   * rămâne închis — userul vede doar badge-ul cu mesaj necitit + jiggle animation.
   * Util dacă vrei un comportament mai puțin intruziv. Folosit doar dacă
   * aiGreetingEnabled=true.
   */
  @Column({ type: 'boolean', default: true })
  aiGreetingAutoOpenChat!: boolean;

  /**
   * Dacă true, meniul de selectare limbă (LangSwitcher din topbar) e afișat.
   * Default false fiindcă pe site-urile multi-tenant convenția e "un domeniu
   * = o limbă". Activează când vrei să dai vizitatorului control manual peste
   * locale (ex. când împărtășești același domeniu pentru mai multe regiuni).
   */
  @Column({ type: 'boolean', default: false })
  langSwitcherEnabled!: boolean;

  /**
   * Lista de IP-uri (exact-match) scutite de maintenanceMode și hiddenMode.
   * Suportă IPv4, IPv6, sau prefix wildcard simplu (ex. "192.168.*"). Pentru
   * fiecare request, dacă IP-ul clientului e în listă, modurile sunt sărite.
   */
  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  ipWhitelist!: string[];

  /**
   * Dacă false, fluxul de generare cere plată ÎNAINTE de a genera. Userul
   * completează formularul, plătește, iar maneaua se generează direct ca
   * versiune completă (90s × 2). Dacă true (default), generăm un demo
   * gratuit de 30s și abia apoi cerem plata pentru a debloca versiunea
   * completă.
   */
  @Column({ type: 'boolean', default: true })
  demoEnabled!: boolean;

  /**
   * Sursă pentru pagina /top:
   *  - 'seed' → date hardcoded (manele demo placeholder, până ai destui useri)
   *  - 'live' → agregare din `generations` (cele mai vizualizate manele finalizate)
   *  - 'template' → top curat manual din mostrele de stil/voce (vezi `topTemplate`)
   * Switch din admin când ai destule generări reale.
   */
  @Column({ type: 'varchar', length: 16, default: 'seed' })
  topSource!: 'seed' | 'live' | 'template';

  /**
   * Top curat manual, folosit doar când `topSource='template'`. Fiecare intrare
   * pointează la o mostră existentă (stil sau voce) și definește titlul, artistul,
   * vizualizările afișate, secunda de start și (opțional) limita de preview.
   */
  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  topTemplate!: SiteTopTemplateItem[];

  /**
   * Stiluri muzicale disponibile pe acest site (carduri din /studio).
   * Dacă goală, web folosește lista hardcoded din `seed-data.ts` (12 stiluri RO).
   */
  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  styles!: SiteStyleEntry[];

  /**
   * Voci disponibile pe acest site. Sistem canonic: doar male / female.
   */
  @Column({
    type: 'jsonb',
    default: () =>
      `'[{"id":"male","nm":"Bărbătească","tg":"Voce de bărbat","av":"♂","gender":"m"},{"id":"female","nm":"Feminină","tg":"Voce de femeie","av":"♀","gender":"f"}]'::jsonb`,
  })
  voices!: SiteVoiceEntry[];

  /**
   * Ocazii (zile naștere, nuntă, etc.) afișate la step 2. Dacă goală, fallback
   * la OCC din `seed-data.ts`.
   */
  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  occasions!: SiteOccasionEntry[];

  /**
   * Testimoniale afișate pe pagina principală. Editabile per-site din admin.
   * Dacă goală, web app folosește lista hardcoded din `seed-data.ts` (TESTI).
   */
  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  testimonials!: SiteTestimonialEntry[];

  /**
   * Mesaj custom pentru pagina de mentenanță, JSON cu cheie = locale.
   * Ex: { ro: "Revenim curând.", en: "Back soon." }
   * Dacă lipsește pentru locale-ul curent, web app cade pe site.locale, apoi pe text default i18n.
   */
  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  maintenanceMessage!: Record<string, string>;

  @Column({ type: 'text', nullable: true })
  notes!: string | null; // note interne admin

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
