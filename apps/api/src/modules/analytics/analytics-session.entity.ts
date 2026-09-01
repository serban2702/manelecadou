import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'analytics_sessions' })
@Index(['siteId', 'startedAt'])
export class AnalyticsSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  /** ID-ul de sesiune din browser (sessionStorage). Stabil pe durata sesiunii. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  sessionKey!: string;

  /** Visitor ID stabil (localStorage). Identifică același vizitator între sesiuni. */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  visitorId!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  guestId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 32, nullable: true })
  experienceSlug!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  personId!: string | null;

  @Column({ type: 'integer', default: 0 })
  pageViews!: number;

  @Column({ type: 'integer', default: 0 })
  events!: number;

  /** Durata calculată = lastActivityAt - startedAt, în secunde. */
  @Column({ type: 'integer', default: 0 })
  durationSec!: number;

  /** Bounce: o singură pagină vizualizată. Calculat la close. */
  @Column({ type: 'boolean', default: true })
  bounced!: boolean;

  // ============ ATTRIBUTION & TRAFFIC ============

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  source!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  medium!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  campaign!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  utmContent!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  utmTerm!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  referrer!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  landingPath!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  exitPath!: string | null;

  // ============ UTM EXTINS + CLICK-ID-URI (vezi `utm-standard.ts`) ============
  // Toate aditive și nullable — `synchronize` le adaugă cu ADD COLUMN (§6.4).
  // Rândurile de dinaintea acestei versiuni rămân cu NULL și se citesc peste tot
  // ca „necunoscut", nu dispar din rapoarte.

  // NICIUNA din coloanele de mai jos nu e indexată, deliberat: toate se citesc
  // doar în GROUP BY peste un interval de zile, unde interogarea e condusă de
  // index-ul `(siteId, startedAt)`. Un index în plus ar încetini fiecare
  // inserare de sesiune fără să grăbească niciun raport. Vezi și §19.2:
  // index-urile se adaugă pentru căutări punctuale, nu „pentru orice eventualitate".

  /** Canal canonic calculat la creare: meta | tiktok | google | chatgpt | email | direct | …
   *  Există ca să nu recalculăm normalizarea la fiecare interogare și ca toate
   *  rapoartele să vadă exact același verdict. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  channel!: string | null;

  /** `utm_id` — ID-ul campaniei din platformă. Cheia de legătură cu `ad_spend`. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  utmId!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  utmSourcePlatform!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  utmCreativeFormat!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  utmMarketingTactic!: string | null;

  /** `utm_adset` — grupul de anunțuri / ad group (audiența). */
  @Column({ type: 'varchar', length: 256, nullable: true })
  adsetName!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  adsetId!: string | null;

  /** `utm_ad` — numele reclamei, când platforma îl expune separat de `utm_content`. */
  @Column({ type: 'varchar', length: 256, nullable: true })
  adName!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  adId!: string | null;

  /** `utm_placement` — feed / story / reels / search / chat. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  placement!: string | null;

  /** Click-ID-ul preferat (fbclid / ttclid / gclid / …). Pus de platformă, deci
   *  supraviețuiește unei reclame cu UTM-uri uitate. */
  @Column({ type: 'varchar', length: 512, nullable: true })
  clickId!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  clickIdSource!: string | null;

  /** Toate click-ID-urile găsite pe URL (se întâmplă la redirect între platforme). */
  @Column({ type: 'jsonb', nullable: true })
  clickIds!: Record<string, string> | null;

  /** Query string-ul de aterizare, brut. Plasa de siguranță pentru un parametru
   *  nou apărut în reclame înainte să-l capturăm explicit. */
  @Column({ type: 'varchar', length: 1024, nullable: true })
  landingQuery!: string | null;

  // ============ EMAIL (linkul urmărit care a adus sesiunea) ============

  /** Tokenul `mc_eid` din linkul de email. Leagă sesiunea de mailul concret. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  emailToken!: string | null;

  // ============ PRIMA ATINGERE (localStorage client, 90 zile) ============
  // Fără ea, un client adus de Meta acum trei zile care revine azi din email
  // apare ca adus de email, iar reclama care l-a găsit nu primește nimic.

  @Column({ type: 'varchar', length: 64, nullable: true })
  firstSource!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  firstMedium!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  firstCampaign!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  firstChannel!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  firstLandingPath!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  firstTouchAt!: Date | null;

  // ============ DEVICE & UA ============

  /** mobile / tablet / desktop */
  @Column({ type: 'varchar', length: 64, nullable: true })
  device!: string | null;

  /** ex: Apple, Samsung, Google, etc. (parsed from UA) */
  @Column({ type: 'varchar', length: 64, nullable: true })
  deviceVendor!: string | null;

  /** ex: iPhone, iPad, Pixel 8, etc. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  deviceModel!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  browserName!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  browserVersion!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  osName!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  osVersion!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  engineName!: string | null;

  @Column({ type: 'boolean', default: false })
  isBot!: boolean;

  // ============ BOT DETECTION ============

  /** Scor de bot 0-100. >=70 considerat bot, 40-69 suspicious, <40 uman. */
  @Index()
  @Column({ type: 'integer', default: 0 })
  botScore!: number;

  /** human | suspicious | datacenter | headless | known_bot */
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'human' })
  botCategory!: string;

  /** Listă de motive (regulile care s-au declanșat). */
  @Column({ type: 'jsonb', nullable: true })
  botReasons!: Array<{ rule: string; weight: number; detail?: string }> | null;

  // ============ SCREEN & VIEWPORT ============

  @Column({ type: 'integer', nullable: true })
  screenWidth!: number | null;

  @Column({ type: 'integer', nullable: true })
  screenHeight!: number | null;

  @Column({ type: 'integer', nullable: true })
  viewportWidth!: number | null;

  @Column({ type: 'integer', nullable: true })
  viewportHeight!: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  devicePixelRatio!: string | null;

  @Column({ type: 'boolean', nullable: true })
  touchCapable!: boolean | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  colorScheme!: string | null;

  @Column({ type: 'boolean', nullable: true })
  reducedMotion!: boolean | null;

  // ============ LOCALE & CONNECTION ============

  @Column({ type: 'varchar', length: 16, nullable: true })
  language!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  timezone!: string | null;

  /** Offset în minute față de UTC, pozitiv = est. */
  @Column({ type: 'integer', nullable: true })
  timezoneOffsetMin!: number | null;

  /** ex: 4g, wifi, slow-2g (din navigator.connection) */
  @Column({ type: 'varchar', length: 16, nullable: true })
  connectionType!: string | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  connectionDownlink!: string | null;

  @Column({ type: 'boolean', nullable: true })
  saveData!: boolean | null;

  // ============ NETWORK & GEO ============

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip!: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 4, nullable: true })
  country!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  countryName!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  region!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  postalCode!: string | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true })
  latitude!: string | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true })
  longitude!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  isp!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  org!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  asn!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  geoSource!: string | null;

  // ============ PRIVACY ============

  @Column({ type: 'boolean', default: false })
  doNotTrack!: boolean;

  @Column({ type: 'boolean', default: false })
  consentGiven!: boolean;

  // ============ TIMESTAMPS ============

  @CreateDateColumn()
  startedAt!: Date;

  @UpdateDateColumn()
  lastActivityAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt!: Date | null;
}
