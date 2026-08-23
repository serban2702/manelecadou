import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type DiscountType = 'percent' | 'fixed';

@Entity({ name: 'promo_codes' })
@Index('idx_promo_site_code', ['siteId', 'code'], { unique: true })
export class PromoCode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  code!: string;

  @Column({ type: 'varchar', length: 16 })
  discountType!: DiscountType;

  /** Pentru percent: 10 = 10%. Pentru fixed: în BANI (cents RON), ex: 500 = 5 lei. */
  @Column({ type: 'integer' })
  discountValue!: number;

  @Column({ type: 'timestamptz', nullable: true })
  validFrom!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  validUntil!: Date | null;

  /** 0 = unlimited */
  @Column({ type: 'integer', default: 0 })
  maxUses!: number;

  @Column({ type: 'integer', default: 0 })
  usedCount!: number;

  /** Dacă e setat, codul e valid doar pentru email-ul ăsta */
  @Index()
  @Column({ type: 'varchar', length: 320, nullable: true })
  restrictedToEmail!: string | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note!: string | null;

  /**
   * Sursa codului: 'admin' (creat manual din /promo), 'roata' (câștigat la roata norocului),
   * 'ai_request' (emis de AI Irina la cererea userului, max 20%),
   * 'recovery' (emis automat de programul de recovery emails — abandon plată),
   * 'post_generation' (cod de fidelizare 40% trimis în emailul de melodie finalizată),
   * 'social_follow' (40% după follow TikTok + Facebook pe pagina manelei).
   * NULL pentru date legacy (înainte de tracking).
   */
  @Column({ type: 'varchar', length: 32, nullable: true })
  source!: 'admin' | 'roata' | 'ai_request' | 'recovery' | 'post_generation' | 'social_follow' | null;

  /** Dacă true, codul a fost emis de AI agent (audit pentru a urmări costul reducerilor). */
  @Column({ type: 'boolean', default: false })
  aiIssued!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity({ name: 'promo_redemptions' })
export class PromoRedemption {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'uuid' })
  promoCodeId!: string;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email!: string | null;

  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  guestId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  paymentId!: string | null;

  @Column({ type: 'integer' })
  appliedDiscountCents!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
