import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Înregistrarea per etapă în `stagesSent`:
 * - trimisă → { sentAt, promoCode }
 * - sărită  → { skippedAt } (când cron-ul descoperă târziu mai multe etape
 *   scadente, trimite doar pe cea mai avansată și le marchează pe restul).
 * - eșuată  → { failedAttempts, lastFailedAt, lastError } cât timp mai reîncercăm;
 *   după plafon primește `gaveUpAt` și etapa nu mai e reîncercată niciodată.
 *
 * O etapă e „închisă" (nu mai e scadentă) doar cu `sentAt`, `skippedAt` sau
 * `gaveUpAt` — vezi `isStageSettled` în recovery.service.ts.
 */
export interface RecoveryStageRecord {
  sentAt?: string;
  promoCode?: string;
  skippedAt?: string;
  /** Câte trimiteri au eșuat pentru etapa asta (plafonate). */
  failedAttempts?: number;
  lastFailedAt?: string;
  lastError?: string;
  /** Setat când am renunțat definitiv (plafon atins) — etapa e închisă. */
  gaveUpAt?: string;
}

/**
 * Starea de recovery per identitate (siteId + email lowercase): clienți care au
 * abandonat plata (payment failed `session_expired` sau generare 'full' pending
 * neplătită) și primesc programul escaladat de emailuri cu reduceri.
 *
 * Un rând = un ciclu. Dacă după conversie (`convertedAt`) apare un abandon NOU,
 * ciclul se resetează (anchorAt nou, stagesSent gol). Opt-out-ul e permanent și
 * are scope DOAR pe recovery (nu atinge tranzacționale sau marketing).
 */
@Entity({ name: 'recovery_states' })
@Index('idx_recovery_site_email', ['siteId', 'email'], { unique: true })
export class RecoveryState {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  /** Întotdeauna lowercase + trim (cheia identității). */
  @Index()
  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  guestId!: string | null;

  /** Cea mai recentă generare 'full' pending a identității (pentru CTA /m/<id>). */
  @Column({ type: 'uuid', nullable: true })
  generationId!: string | null;

  /** Cea mai recentă plată failed (session_expired) a identității. */
  @Column({ type: 'uuid', nullable: true })
  paymentId!: string | null;

  /** Momentul abandonului = cel mai recent eveniment failed/pending. Etapele
   *  programului se calculează relativ la acest moment. */
  @Column({ type: 'timestamptz' })
  anchorAt!: Date;

  /** Map stageKey ('h1'|'h4'|'h24'|'h48'|'h72'|'d7') → RecoveryStageRecord. */
  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  stagesSent!: Record<string, RecoveryStageRecord>;

  /** Token unic per candidat pentru linkul de dezabonare din footer. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  optOutToken!: string;

  @Column({ type: 'timestamptz', nullable: true })
  optedOutAt!: Date | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  optOutReason!: string | null;

  /** Setat când identitatea are o plată 'paid' ulterioară anchor-ului. */
  @Column({ type: 'timestamptz', nullable: true })
  convertedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
