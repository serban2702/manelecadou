import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CampaignAudience = 'all' | 'payers' | 'nonpayers' | 'single';
export type CampaignStatus = 'draft' | 'sending' | 'sent' | 'failed';

/** O campanie de marketing trimisă manual din admin. */
@Entity({ name: 'marketing_campaigns' })
export class MarketingCampaign {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  /** id-ul șablonului din registry (ex. discount_offer). */
  @Column({ type: 'varchar', length: 64 })
  templateId!: string;

  @Column({ type: 'varchar', length: 16, default: 'all' })
  audience!: CampaignAudience;

  /** Cod promo (existent) atașat campaniei — opțional. */
  @Column({ type: 'uuid', nullable: true })
  promoCodeId!: string | null;

  /** Snapshot al codului promo la momentul trimiterii (pentru afișare). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  promoCodeSnapshot!: string | null;

  /** Override-uri editate de admin (headline, bodyHtml, ctaUrl, ctaLabel). */
  @Column({ type: 'jsonb', nullable: true })
  overrides!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status!: CampaignStatus;

  @Column({ type: 'int', default: 0 })
  totalRecipients!: number;

  @Column({ type: 'int', default: 0 })
  sentCount!: number;

  @Column({ type: 'int', default: 0 })
  failedCount!: number;

  @Column({ type: 'varchar', length: 320, nullable: true })
  createdByEmail!: string | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt!: Date | null;
}

export type RuleTrigger = 'nonpayer' | 'payer';

/** O regulă automată (drip) care trimite oferte la X zile după înscriere. */
@Entity({ name: 'marketing_rules' })
export class MarketingRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  /** nonpayer = nu a plătit niciodată. payer = a plătit cel puțin o dată. */
  @Column({ type: 'varchar', length: 16 })
  trigger!: RuleTrigger;

  /** Câte zile de la înscriere (createdAt) trebuie să treacă pentru a fi eligibil. */
  @Column({ type: 'int', default: 3 })
  daysAfter!: number;

  /** Șablonul folosit (ex. discount_offer / winback_payer). */
  @Column({ type: 'varchar', length: 64 })
  templateId!: string;

  @Column({ type: 'varchar', length: 16, default: 'percent' })
  discountType!: 'percent' | 'fixed';

  /** % (1-100) sau cents (pentru fixed). */
  @Column({ type: 'int', default: 15 })
  discountValue!: number;

  /** Câte zile e valabil codul personal generat pentru fiecare destinatar. */
  @Column({ type: 'int', default: 14 })
  validDays!: number;

  @Column({ type: 'boolean', default: false })
  active!: boolean;

  @Column({ type: 'int', default: 0 })
  totalSent!: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastRunAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
