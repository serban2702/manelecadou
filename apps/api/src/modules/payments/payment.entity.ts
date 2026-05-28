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

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
