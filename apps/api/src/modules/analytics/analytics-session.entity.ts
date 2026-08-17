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
