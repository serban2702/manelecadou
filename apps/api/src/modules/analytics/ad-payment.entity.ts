import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { AdPlatform } from './ad-spend.entity';

/**
 * Tipul unei plăți pe care o faci TU către platforma de ads (cash-flow real,
 * banii care îți ies din buzunar) — distinct de `ad_spend` care e CONSUMUL
 * raportat de Meta (cât s-a dus pe reclame). Reconcilierea compară cele două.
 *
 * - `fund_loading` — alimentare cont (prepaid): bagi bani în soldul de ads.
 * - `payment`      — plată factură / debit automat de pe card (postpaid).
 * - `refund`       — rambursare primită înapoi de la platformă (scade netul plătit).
 */
export type AdPaymentType = 'fund_loading' | 'payment' | 'refund';

export const AD_PAYMENT_TYPES: AdPaymentType[] = ['fund_loading', 'payment', 'refund'];

/**
 * Registru manual de plăți/alimentări către platformele de advertising (deocamdată
 * Meta). Spre deosebire de `ad_spend` (tras automat din Marketing API = consumul
 * recunoscut de platformă), aici adminul introduce MANUAL banii reali plătiți —
 * fiindcă alimentările/facturile NU sunt expuse de Marketing API (scope `ads_read`).
 *
 * `synchronize: true` în prod creează tabelul + index-urile automat (additive, safe).
 */
@Entity({ name: 'ad_payment' })
@Index('ix_ad_payment_site_date', ['siteId', 'date'])
export class AdPayment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  /** Platforma către care s-a făcut plata. Deocamdată doar 'meta', dar lăsăm
   *  coloana ca să putem extinde la 'tiktok' fără migrare. */
  @Column({ type: 'varchar', length: 16, default: 'meta' })
  platform!: AdPlatform;

  @Column({ type: 'varchar', length: 24 })
  type!: AdPaymentType;

  /** Suma plății în cele mai mici unități ale monedei (cents). Mereu pozitivă;
   *  semnul în reconciliere e dat de `type` (refund scade). */
  @Column({ type: 'integer' })
  amountCents!: number;

  /** Moneda în care ai plătit efectiv (de regulă moneda contului de ads). */
  @Column({ type: 'varchar', length: 8, default: 'RON' })
  currency!: string;

  /** Ziua plății (date, fără oră), format YYYY-MM-DD. */
  @Column({ type: 'date' })
  date!: string;

  /** Referință liberă: nr. factură Meta, ultimele 4 cifre card, ID tranzacție etc. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  reference!: string | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  /** Emailul adminului care a introdus plata (audit). */
  @Column({ type: 'varchar', length: 256, nullable: true })
  createdByEmail!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
