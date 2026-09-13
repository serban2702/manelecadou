import type { ProfitExpenseItem } from './profit-config.entity';

/**
 * Regulile pur aritmetice ale raportului de profitabilitate, scoase din serviciu
 * ca să poată fi testate fără NestJS și fără bază de date. Aici se decide, la
 * propriu, ce sumă intră în cheltuieli și pe ce se calculează TVA-ul — greșelile
 * de aici nu dau eroare, dau un profit care arată plauzibil și e fals.
 */

/** Cheia de perioadă a unei zile: `YYYY-MM` (lunar) sau anul fiscal mai→apr (anual). */
export function periodKey(cadence: 'monthly' | 'yearly', day: string): string {
  if (cadence === 'monthly') return day.slice(0, 7);
  const yy = +day.slice(0, 4);
  const mm = +day.slice(5, 7);
  return String(mm >= 5 ? yy : yy - 1);
}

/**
 * Valoarea (în moneda item-ului) aplicabilă zilei `day`: override-ul perioadei,
 * altfel `defaultAmount`. Zilele din afara `startDay`–`endDay` (ambele INCLUSIVE)
 * valorează 0 — un abonament oprit nu se mai facturează, nici dacă luna lui a
 * rămas cu un override în config.
 */
export function expenseValueForDay(item: ProfitExpenseItem, day: string): number {
  if (item.startDay && day < item.startDay) return 0;
  if (item.endDay && day > item.endDay) return 0;
  const override = item.amounts?.[periodKey(item.cadence, day)];
  if (override != null && Number.isFinite(override)) return override;
  return item.defaultAmount != null && Number.isFinite(item.defaultAmount) ? item.defaultAmount : 0;
}
