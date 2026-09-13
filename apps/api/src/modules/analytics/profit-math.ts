import type { ProfitExpenseItem } from './profit-config.entity';

/**
 * Regulile pur aritmetice ale raportului de profitabilitate, scoase din serviciu
 * ca să poată fi testate fără NestJS și fără bază de date. Aici se decide, la
 * propriu, ce sumă intră în cheltuieli și pe ce se calculează TVA-ul — greșelile
 * de aici nu dau eroare, dau un profit care arată plauzibil și e fals.
 */

/** Pro-rata: o lună standard are 30.5 zile, un an 365 (convenția owner-ului). */
export const DAYS_PER_MONTH = 30.5;
export const DAYS_PER_YEAR = 365;

/** Numărul de zile calendaristice din [a,b], ambele INCLUSIVE. 0 dacă b < a. */
export function inclusiveDayCount(a: string, b: string): number {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  const n = Math.round((db - da) / 86_400_000) + 1;
  return n > 0 ? n : 0;
}

/** Cheia de perioadă a unei zile: `YYYY-MM` (lunar) sau anul fiscal mai→apr (anual). */
export function periodKey(cadence: 'monthly' | 'yearly' | 'once', day: string): string {
  if (cadence === 'monthly') return day.slice(0, 7);
  const yy = +day.slice(0, 4);
  const mm = +day.slice(5, 7);
  return String(mm >= 5 ? yy : yy - 1);
}

/** `true` dacă ziua cade în intervalul de activitate al cheltuielii (capete inclusive). */
export function isDayInRange(item: ProfitExpenseItem, day: string): boolean {
  if (item.startDay && day < item.startDay) return false;
  if (item.endDay && day > item.endDay) return false;
  return true;
}

/**
 * Valoarea (în moneda item-ului) aplicabilă PERIOADEI zilei `day`: override-ul
 * perioadei, altfel `defaultAmount`. Zilele din afara `startDay`–`endDay`
 * valorează 0 — un abonament oprit nu se mai facturează, nici dacă luna lui a
 * rămas cu un override în config.
 */
export function expenseValueForDay(item: ProfitExpenseItem, day: string): number {
  if (!isDayInRange(item, day)) return 0;
  const override = item.amounts?.[periodKey(item.cadence, day)];
  if (override != null && Number.isFinite(override)) return override;
  return item.defaultAmount != null && Number.isFinite(item.defaultAmount) ? item.defaultAmount : 0;
}

/**
 * Cât costă cheltuiala în ziua `day`, în moneda ei. Asta e singura funcție pe
 * care o folosește raportul; restul sunt cărămizile ei.
 *
 * Pentru `once`, suma se împarte la zilele REALE ale intervalului, deci totalul
 * pe tot intervalul e fix suma introdusă. Pentru `monthly`/`yearly` divizorul e
 * convențional (30.5 / 365), deci o lună de 31 de zile iese cu ~1,6% peste
 * factură — acceptabil pentru un abonament care curge, greșit pentru o plată
 * unică.
 */
export function dailyExpenseValue(item: ProfitExpenseItem, day: string): number {
  if (item.cadence === 'once') {
    // Fără ambele capete nu există interval pe care să împărțim suma.
    if (!item.startDay || !item.endDay || !isDayInRange(item, day)) return 0;
    const days = inclusiveDayCount(item.startDay, item.endDay);
    if (days <= 0) return 0;
    const total =
      item.defaultAmount != null && Number.isFinite(item.defaultAmount) ? item.defaultAmount : 0;
    return total / days;
  }
  const divisor = item.cadence === 'yearly' ? DAYS_PER_YEAR : DAYS_PER_MONTH;
  return expenseValueForDay(item, day) / divisor;
}
