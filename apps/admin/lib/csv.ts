'use client';

/**
 * Construiește un CSV (cu BOM UTF-8 pentru Excel + diacritice/greacă).
 * Delimitator implicit `;` — se deschide corect prin dublu-click în Excel RO
 * (unde virgula e separator zecimal). Formatează sumele cu virgulă zecimală.
 */
export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
  delimiter = ';',
): string {
  const special = new RegExp(`["\\n\\r${delimiter}]`);
  const esc = (v: string | number | null | undefined): string => {
    const s = v == null ? '' : String(v);
    return special.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers, ...rows].map((r) => r.map(esc).join(delimiter));
  return '﻿' + lines.join('\r\n');
}

/** Descarcă un string CSV ca fișier. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Sumă în bani (cents) → string cu virgulă zecimală, ex. 3138 → „31,38". */
export function csvMoney(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toFixed(2).replace('.', ',');
}
