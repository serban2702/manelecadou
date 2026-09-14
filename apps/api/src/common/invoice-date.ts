/** Fusul orar al firmei emitente — data de pe o factură fiscală e a României,
 *  indiferent de fusul serverului sau al celui care apasă butonul. */
export const INVOICE_TIME_ZONE = 'Europe/Bucharest';

/**
 * Data de azi în România, ca `YYYY-MM-DD` — formatul cerut de SmartBill.
 *
 * NU `new Date().toISOString().slice(0, 10)`: containerul de API rulează pe UTC,
 * deci o factură emisă între 00:00 și 03:00 ora României ieșea datată cu ziua
 * precedentă (iarna, între 00:00 și 02:00). Nici nu ne bazăm pe `TZ` în container:
 * ar fi o dependență invizibilă, care rupe datele fiscale tăcut dacă se schimbă.
 *
 * `en-CA` e locale-ul care formatează nativ ca `YYYY-MM-DD`.
 */
export function invoiceToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: INVOICE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
