import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AdPlatform = 'meta' | 'tiktok';

/**
 * Cheltuieli zilnice de advertising trase din Marketing API (Meta) / Marketing API
 * (TikTok), defalcate pe campanie. Un rând per (siteId, platform, campaignId, day).
 *
 * `synchronize: true` în prod creează tabelul + index-ul automat (additive, safe).
 *
 * Upsert idempotent pe index-ul unic `(siteId, platform, campaignId, date)` —
 * sincronizarea trage ultimele ~N zile cu overlap, deci aceleași rânduri se
 * rescriu cu valorile finale (Meta/TikTok ajustează spend-ul retroactiv 1-2 zile).
 */
@Entity({ name: 'ad_spend' })
@Index('ux_ad_spend_unique', ['siteId', 'platform', 'campaignId', 'date'], { unique: true })
export class AdSpend {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Column({ type: 'varchar', length: 16 })
  platform!: AdPlatform;

  /** ID-ul campaniei la platformă (Meta campaign.id / TikTok campaign_id). */
  @Column({ type: 'varchar', length: 64 })
  campaignId!: string;

  @Column({ type: 'varchar', length: 256, nullable: true })
  campaignName!: string | null;

  /** Ziua căreia i se atribuie cheltuiala (date, fără oră), format YYYY-MM-DD. */
  @Column({ type: 'date' })
  date!: string;

  /** Cheltuiala în cele mai mici unități ale monedei contului de ads (cents). */
  @Column({ type: 'integer', default: 0 })
  spendCents!: number;

  /** Moneda contului de ads (poate diferi de moneda site-ului). */
  @Column({ type: 'varchar', length: 8, default: 'EUR' })
  currency!: string;

  @Column({ type: 'integer', default: 0 })
  impressions!: number;

  @Column({ type: 'integer', default: 0 })
  clicks!: number;

  /** Când a fost ultima dată trasă valoarea din API (pentru audit / staleness). */
  @Column({ type: 'timestamptz', nullable: true })
  fetchedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
