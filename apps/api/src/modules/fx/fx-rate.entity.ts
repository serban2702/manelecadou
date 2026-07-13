import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Curs de referință BNR, o intrare per (dată de referință, valută).
 * `rateToRon` = câți RON valorează 1 unitate din `currency` (ex. EUR → 5.2339),
 * normalizat pentru multiplier (HUF/JPY etc. vin per 100 în XML-ul BNR).
 *
 * Sursă: https://www.bnr.ro/nbrfxrates.xml (ziua curentă),
 * nbrfxrates10days.xml (plasă) și curs.bnr.ro/files/xml/years/nbrfxrates<AN>.xml
 * (istoric complet). Tabela e additive (CREATE TABLE) — safe pentru
 * `synchronize: true` (vezi CLAUDE.md §6.2).
 */
@Entity({ name: 'fx_rates' })
@Unique(['date', 'currency'])
@Index(['currency', 'date'])
export class FxRate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Data de referință BNR (Cube date, `yyyy-mm-dd`). */
  @Column({ type: 'date' })
  date!: string;

  /** Codul ISO al valutei (EUR, USD, ...). RON nu se stochează (mereu 1). */
  @Column({ type: 'varchar', length: 8 })
  currency!: string;

  /** Câți RON = 1 unitate din `currency` (normalizat pentru multiplier). */
  @Column({ type: 'decimal', precision: 18, scale: 8 })
  rateToRon!: string;

  @Column({ type: 'varchar', length: 24, default: 'bnr' })
  source!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
