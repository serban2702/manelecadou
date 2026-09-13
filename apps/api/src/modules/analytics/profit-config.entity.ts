import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * O singură cheltuială recurentă (lunară sau anuală) din raportul de profitabilitate.
 *
 * - `cadence='monthly'` → `amounts` e cheiat pe lună calendaristică `YYYY-MM`
 *   (ex. "2026-05"); pro-rata = sumă / 30.5 × zile_din_lună_în_interval.
 * - `cadence='yearly'` → `amounts` e cheiat pe AN FISCAL care începe în mai,
 *   eticheta = anul de start `YYYY` (ex. "2026" = 05.2026 → 04.2027);
 *   pro-rata = sumă / 365 × zile_din_anul-fiscal_în_interval.
 *
 * `defaultAmount` (opțional) se aplică oricărei perioade fără override în `amounts`
 * — util pentru abonamente fixe (Grok 30$, Capcut 20$, Hetzner 45€). Valorile sunt
 * în UNITATEA monedei (nu cents) — ex. 30 = 30 USD.
 */
export interface ProfitExpenseItem {
  id: string;
  label: string;
  cadence: 'monthly' | 'yearly';
  currency: 'RON' | 'EUR' | 'USD';
  /** Override per perioadă (cheie `YYYY-MM` sau `YYYY`), în unitatea monedei. */
  amounts: Record<string, number>;
  /** Valoare implicită aplicată perioadelor fără override (unitatea monedei). */
  defaultAmount?: number | null;
  /**
   * Prima zi în care cheltuiala e activă (`YYYY-MM-DD`, INCLUSIV). Gol = dintotdeauna.
   * Există pentru abonamente ținute doar câteva luni (ex. Grok 18.05→18.08): fără
   * interval, `defaultAmount` s-ar aplica la nesfârșit, iar pe un raport pe tot
   * istoricul ar factura luni în care serviciul nici nu era plătit.
   */
  startDay?: string | null;
  /** Ultima zi în care cheltuiala e activă (`YYYY-MM-DD`, INCLUSIV). Gol = până azi. */
  endDay?: string | null;
  /**
   * `true` = suma e FĂRĂ TVA, deci intră în baza pe care se calculează TVA-ul.
   * `false` (implicit) = TVA-ul e deja în sumă — cazul obișnuit al facturilor
   * de la furnizori români. Aplicat greșit, TVA-ul s-ar număra de două ori.
   */
  vatApplies?: boolean;
  /** Cheie pentru cheltuielile predefinite (chatgpt/grok/capcut/tiktok_ads/domains). */
  builtin?: string | null;
}

/** Curs de schimb (în RON) pentru EUR și USD. */
export interface FxRate {
  eurToRon: number;
  usdToRon: number;
}

/** Toată configurarea raportului de profitabilitate (un singur blob editabil din admin). */
export interface ProfitConfigData {
  /** Curs implicit (fallback), folosit pentru orice săptămână fără override în `fxWeekly`. */
  fx: FxRate;
  /**
   * Cursuri valutare PER SĂPTĂMÂNĂ. Cheia = lunea săptămânii ISO (`YYYY-MM-DD`).
   * Cursul săptămânii se aplică tuturor zilelor ei la conversia cheltuielilor în RON.
   */
  fxWeekly: Record<string, FxRate>;
  /** Cost Suno per request de generare, în USD (default 0.06). */
  sunoUsdPerRequest: number;
  /** Cota TVA aplicată peste cheltuieli (procent, ex. 21). */
  vatRatePct: number;
  /** Impozit pe venit microîntreprindere (procent din venituri, ex. 1). */
  microTaxRatePct: number;
  /** Lista de cheltuieli recurente (predefinite + custom). */
  items: ProfitExpenseItem[];
}

/**
 * Stochează configurarea raportului de profitabilitate ca un singur rând (global,
 * la nivel de business — cheltuielile precum Grok/Hetzner/domenii nu sunt per-site).
 * `synchronize: true` creează tabelul automat (additive, safe).
 */
@Entity({ name: 'profit_config' })
export class ProfitConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'jsonb' })
  data!: ProfitConfigData;

  @UpdateDateColumn()
  updatedAt!: Date;
}
