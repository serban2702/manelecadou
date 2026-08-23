import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

@Entity({ name: 'payments' })
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'stripe' })
  provider!: string;

  @Index()
  @Column({ type: 'varchar', length: 256, nullable: true })
  providerSessionId!: string | null;

  @Column({ type: 'integer' })
  amount!: number;

  @Column({ type: 'varchar', length: 8, default: 'RON' })
  currency!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: PaymentStatus;

  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  guestId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 32, nullable: true })
  experienceSlug!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  personId!: string | null;

  /** Cursul Stripe în RON la momentul plății (pentru rapoarte cross-currency).
   *  Setat din balance_transaction.exchange_rate la webhook (1.0 când valuta e deja RON). */
  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  exchangeRateToRon!: string | null;

  /** Suma echivalentă în bani (cents) RON, pentru rapoarte unificate. */
  @Column({ type: 'integer', nullable: true })
  amountRonCents!: number | null;

  /** Motiv detaliat când status='failed' (extras din Stripe). Ex:
   *  "Your card was declined. Reason: insufficient_funds". */
  @Column({ type: 'text', nullable: true })
  failureReason!: string | null;

  /** Cod scurt din Stripe (decline_code, error code, etc.) — util pentru filtrări. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  failureCode!: string | null;

  /** ID-ul sesiunii OpenReplay (self-hosted) la momentul creării plății.
   *  Populat automat din header X-OpenReplay-SessionID via TypeORM subscriber. */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  openReplaySessionId!: string | null;

  // ============== Meta Pixel attribution (capturate la checkout creation) ==============
  // Aceste câmpuri merg DIRECT în CAPI Purchase event la webhook. Fără ele EMQ scade
  // sub 4/10 și atribuirea iOS se rupe complet (40%+ Purchase events s-ar pierde).

  /** _fbp cookie de la utilizatorul care a inițiat checkout-ul. Format „fb.1.<ts>.<rand>". */
  @Column({ type: 'varchar', length: 256, nullable: true })
  fbp!: string | null;

  /** _fbc cookie (click-id Facebook). Format „fb.1.<ts>.<fbclid>". Critic pentru atribuire ads. */
  @Column({ type: 'varchar', length: 512, nullable: true })
  fbc!: string | null;

  /** User-Agent al browserului la creare. Pentru EMQ + bot detection în Purchase event. */
  @Column({ type: 'text', nullable: true })
  userAgent!: string | null;

  /** IP-ul real al utilizatorului la creare (din X-Forwarded-For). Diferit de webhook IP (Stripe). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddress!: string | null;

  /**
   * Idempotency lock: când Meta CAPI Purchase event a fost trimis pentru această
   * plată. Stripe retrimite uneori webhook-uri (la timeout sau dacă există multiple
   * subscriptions configurate) — fără asta, Meta primește 2+ Purchase server-side
   * pentru aceeași plată și inflează statisticile (chiar dacă dedup-uiește prin
   * event_id, „Total server events received" crește artificial).
   * Setat atomic prin UPDATE ... WHERE capiPurchaseSentAt IS NULL.
   */
  @Column({ type: 'timestamptz', nullable: true })
  capiPurchaseSentAt!: Date | null;

  // ============== Atribuire trafic (capturate la checkout creation) ==============
  // Leagă plata DIRECT de sesiunea de analytics care a generat-o, pentru atribuire
  // 100% precisă pe surse/campanii/device. Fără ele, atribuirea cade pe IP+fereastră
  // de timp (heuristic, ~60% acoperire). Vezi AnalyticsService.marketingBreakdown.

  /** sessionKey al sesiunii de analytics din care a pornit checkout-ul (sessionStorage client). */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  sessionKey!: string | null;

  /** visitorId stabil (localStorage client) — leagă plata de toate sesiunile vizitatorului. */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  visitorId!: string | null;

  // ============== Snapshot atribuire trafic (înghețat la checkout / backfill) ==============
  // Calculat o dată din analytics_sessions + ad_spend, apoi NU se mai recalculează
  // la fiecare refresh din admin. Fără snapshot, o revenire pe email/direct muta
  // plata de pe campania Meta pe care a venit. Vezi PaymentAttributionService.

  /** Canal canonic: facebook | instagram | google | email | direct | … */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  attributionSource!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  attributionMedium!: string | null;

  /** utm_campaign brut (decodat; ID Meta numeric sau nume). */
  @Column({ type: 'varchar', length: 256, nullable: true })
  attributionCampaign!: string | null;

  /** Nume campanie rezolvat via ad_spend. Null = am știut canalul, nu și reclama. */
  @Column({ type: 'varchar', length: 256, nullable: true })
  attributionCampaignName!: string | null;

  /** Creativ/ad (utm_content → ad_spend.adName). */
  @Column({ type: 'varchar', length: 256, nullable: true })
  attributionCreative!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  attributionReferrer!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  attributionLandingPath!: string | null;

  /** Cum am legat plata de sesiune: session_key | visitor | user | guest | ip | event_url | none. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  attributionMatch!: string | null;

  /** Setat când snapshot-ul e scris. Null = încă nerezolvat (plăți pre-deploy). */
  @Column({ type: 'timestamptz', nullable: true })
  attributedAt!: Date | null;

  // ============== Date cumpărător (din Stripe customer_details, la webhook) ==============

  /** Numele complet al cumpărătorului (Stripe customer_details.name). Sursă pentru `buyerGender`. */
  @Column({ type: 'varchar', length: 160, nullable: true })
  customerName!: string | null;

  /** Emailul cumpărătorului (Stripe customer_details.email) — reconciliere + audiență. */
  @Column({ type: 'varchar', length: 320, nullable: true })
  customerEmail!: string | null;

  /** Genul cumpărătorului ('M'|'F'), inferat din `customerName` (prenume RO). Null = necunoscut. */
  @Index()
  @Column({ type: 'varchar', length: 8, nullable: true })
  buyerGender!: string | null;

  // ===== Adresă de facturare (Stripe customer_details.address, la webhook) =====
  // Persistată pe plată ca să NU mai interogăm Stripe per rând la /facturare și ca
  // /clienti să aibă date reale. Backfill one-time pentru plățile vechi
  // (PaymentsService.backfillBillingDetails). Safe additive (synchronize: true).

  /** Stradă + număr (line1 + line2 din Stripe). */
  @Column({ type: 'varchar', length: 512, nullable: true })
  billingAddress!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  billingCity!: string | null;

  /** Județ / regiune (Stripe address.state — poate fi cod ISO „CJ" sau nume). */
  @Column({ type: 'varchar', length: 128, nullable: true })
  billingCounty!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  billingPostalCode!: string | null;

  /** Cod țară ISO (ex. „RO"). */
  @Column({ type: 'varchar', length: 8, nullable: true })
  billingCountry!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  billingPhone!: string | null;

  /** Când am sincronizat ultima dată datele de facturare din Stripe (backfill/webhook). */
  @Column({ type: 'timestamptz', nullable: true })
  billingSyncedAt!: Date | null;

  /** Momentul confirmării plății (status → 'paid'). Distinct de createdAt (inițiere checkout). */
  @Column({ type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  // ============== Comision Stripe (cache pentru raportul de profitabilitate) ==============
  // Stripe nu expune un fee constant — variază chiar și la plăți de aceeași sumă. Îl
  // tragem din `balance_transaction.fee` (prin API, on-demand) și îl cache-uim aici
  // ca să nu reinterogăm Stripe la fiecare deschidere a dashboard-ului. Populat de
  // ProfitabilityService.backfillStripeFees(). Safe additive (synchronize: true).

  /** Comisionul Stripe în cele mai mici unități ale monedei de settlement (`stripeFeeCurrency`). */
  @Column({ type: 'integer', nullable: true })
  stripeFeeCents!: number | null;

  /** Moneda în care Stripe a reținut comisionul (moneda contului/settlement, de regulă RON). */
  @Column({ type: 'varchar', length: 8, nullable: true })
  stripeFeeCurrency!: string | null;

  /** Refacere plătită (15 lei) pe o manea deja livrată — NU e o comandă nouă. */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  remakeForGenerationId!: string | null;

  @Column({ type: 'text', nullable: true })
  remakeNotes!: string | null;

  /** Setat atomic la webhook ca să nu pornim două refaceri pe același retry Stripe. */
  @Column({ type: 'timestamptz', nullable: true })
  remakeAppliedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
