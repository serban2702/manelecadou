import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Înregistrare manuală făcută din panoul admin: câte credite Suno au fost cumpărate
 * și pe câți bani. Folosim aceste înregistrări pentru a calcula soldul curent
 * de credite și costul mediu per credit.
 */
@Entity({ name: 'suno_credit_purchases' })
export class SunoCreditPurchase {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Site-ul căruia îi este atribuită această cumpărare. NULL = global (împărțit
   * pe toate site-urile). În rapoartele financiare per-site, calculăm costul
   * Suno pe baza generărilor efectuate de fiecare site, nu a câmpului ăsta.
   */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  /** Numărul de credite cumpărate la această tranzacție. */
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  credits!: string;

  /** Suma plătită în RON (lei). Stocat ca numeric pentru precizie. */
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amountRon!: string;

  /** Suma plătită în USD, opțional (Suno facturează în USD de obicei). */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  amountUsd!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Index()
  @Column({ type: 'date' })
  purchasedAt!: string;

  @CreateDateColumn()
  createdAt!: Date;

  /** Email-ul adminului care a înregistrat tranzacția. */
  @Column({ type: 'varchar', length: 256, nullable: true })
  recordedByEmail!: string | null;
}
