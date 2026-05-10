import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type GiftTier = 'single' | 'pack3' | 'pack10';

export const TIER_PRICES_RON: Record<GiftTier, number> = {
  single: 2499,
  pack3: 6900,
  pack10: 19900,
};

export const TIER_USES: Record<GiftTier, number> = {
  single: 1,
  pack3: 3,
  pack10: 10,
};

@Entity({ name: 'gift_codes' })
@Index('idx_gift_site_code', ['siteId', 'code'], { unique: true })
export class GiftCode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 16 })
  code!: string;

  @Column({ type: 'varchar', length: 16 })
  tier!: GiftTier;

  @Column({ type: 'integer' })
  usesLeft!: number;

  @Column({ type: 'integer' })
  totalUses!: number;

  /** Cine a cumpărat — user sau guest */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  purchasedByUserId!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  purchasedByGuestId!: string | null;

  /** Email-ul către care s-a trimis codul (de regulă cel al cumpărătorului) */
  @Column({ type: 'varchar', length: 320, nullable: true })
  purchasedByEmail!: string | null;

  /** Plata aferentă cumpărării codului */
  @Column({ type: 'uuid', nullable: true })
  paymentId!: string | null;

  /** Ultima persoană care a folosit codul (pentru audit) */
  @Column({ type: 'uuid', nullable: true })
  lastRedeemedByUserId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  lastRedeemedByGuestId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastRedeemedAt!: Date | null;

  @Column({ type: 'timestamptz' })
  validUntil!: Date;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
