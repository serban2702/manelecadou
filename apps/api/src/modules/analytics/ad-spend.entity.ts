import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AdPlatform = 'meta' | 'tiktok' | 'chatgpt';

/** Toate platformele de care tragem spend, în ordinea de afișare din admin. */
export const AD_PLATFORMS: AdPlatform[] = ['meta', 'tiktok', 'chatgpt'];

/**
 * Cheltuieli zilnice de advertising trase din Marketing API (Meta), Marketing API
 * (TikTok) și Advertiser API — Insights (ChatGPT / OpenAI), defalcate la nivel de
 * AD (un rând per ad per zi). Fiecare rând conține
 * și ierarhia părinte (campanie + ad set / ad group) ca să putem agrega în sus
 * pentru drill-down campanie → ad set → ad.
 *
 * `synchronize: true` în prod creează tabelul + index-ul automat.
 *
 * Upsert idempotent pe index-ul unic `(siteId, platform, adId, date)` —
 * sincronizarea trage ultimele ~N zile cu overlap, deci aceleași rânduri se
 * rescriu cu valorile finale (Meta/TikTok ajustează retroactiv 1-2 zile).
 */
@Entity({ name: 'ad_spend' })
@Index('ux_ad_spend_unique', ['siteId', 'platform', 'adId', 'date'], { unique: true })
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

  /** ID-ul ad set-ului (Meta adset_id) / ad group-ului (TikTok adgroup_id). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  adsetId!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  adsetName!: string | null;

  /** ID-ul ad-ului individual (Meta ad_id / TikTok ad_id). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  adId!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  adName!: string | null;

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

  /** Număr de conversii Purchase atribuite de platformă (Meta omni_purchase /
   *  TikTok complete_payment). Folosit pentru cost/conversie per nivel. */
  @Column({ type: 'integer', default: 0 })
  conversions!: number;

  /** Valoarea conversiilor atribuită de platformă, în cents (moneda contului).
   *  Pentru ROAS calculat de platformă (vs ROAS-ul nostru față de Stripe). */
  @Column({ type: 'integer', default: 0 })
  conversionValueCents!: number;

  /** Când a fost ultima dată trasă valoarea din API (pentru audit / staleness). */
  @Column({ type: 'timestamptz', nullable: true })
  fetchedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
