/**
 * Notificarea push trimisă owner-ului la fiecare plată reușită.
 *
 * Merge pe același canal ca alertele de credite Suno (Wingo Notifications,
 * `WINGO_API_KEY` din settings) — cerință explicită: „aceeași cheie api".
 *
 * Titlul e ce se vede pe ecranul blocat, deci conține exact ce s-a cerut:
 * SITE-UL și SUMA cu moneda. Restul detaliilor stau în corp.
 */

export interface PaymentNotificationInput {
  /** Suma în bani (cents), ca în `Payment.amount`. */
  amountCents: number;
  currency: string;
  /** Domeniul tenantului — ce vrea owner-ul să vadă primul în titlu. */
  siteDomain: string | null;
  /** Numele de brand al site-ului (ex. „ЧалгаПодарък"). */
  siteName?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  packageTier?: string | null;
  /** Eticheta pachetului („Standard" / „Plus" / „Premium"). */
  packageLabel?: string | null;
  recipientName?: string | null;
  style?: string | null;
  occasion?: string | null;
  voiceArtist?: string | null;
  experienceSlug?: string | null;
  generationId?: string | null;
  paymentId: string;
  /** Echivalentul în lei, când moneda plății nu e RON (curs BNR). */
  amountRonCents?: number | null;
  /** Marchează plățile care nu sunt o comandă nouă (refacere plătită, upgrade). */
  kind?: 'order' | 'remake' | 'upgrade' | null;
}

/** `1499` + `EUR` → `14.99 EUR`. Fără localizare: e pentru ochii owner-ului. */
export function formatAmount(amountCents: number, currency: string): string {
  const cur = (currency || '').toUpperCase() || '?';
  return `${(amountCents / 100).toFixed(2)} ${cur}`;
}

const KIND_LABEL: Record<string, string> = {
  remake: ' (refacere)',
  upgrade: ' (upgrade)',
};

/**
 * Titlul: site + sumă + monedă, în ordinea cerută. Notificările sunt trunchiate
 * pe telefon în jur de 65 de caractere, deci nu punem nimic altceva înainte.
 */
export function buildPaymentTitle(i: PaymentNotificationInput): string {
  const site = (i.siteDomain || i.siteName || 'site necunoscut').trim();
  const suffix = i.kind ? KIND_LABEL[i.kind] ?? '' : '';
  return `💰 ${site} — ${formatAmount(i.amountCents, i.currency)}${suffix}`;
}

/** Corpul: tot ce ajută la identificarea comenzii, o informație pe linie. */
export function buildPaymentBody(i: PaymentNotificationInput): string {
  const lines: string[] = [];

  const pkg = [i.packageLabel || i.packageTier, formatAmount(i.amountCents, i.currency)]
    .filter(Boolean)
    .join(' · ');
  lines.push(`Pachet: ${pkg}`);

  // Echivalentul în lei doar când chiar aduce ceva (plată în altă monedă).
  if (i.amountRonCents != null && (i.currency || '').toUpperCase() !== 'RON') {
    lines.push(`În lei: ${formatAmount(i.amountRonCents, 'RON')}`);
  }

  const who = [i.customerEmail, i.customerName].filter(Boolean).join(' · ');
  lines.push(`Client: ${who || '(fără email)'}`);

  if (i.siteName && i.siteDomain && i.siteName !== i.siteDomain) {
    lines.push(`Site: ${i.siteName} (${i.siteDomain})`);
  } else {
    lines.push(`Site: ${i.siteDomain || i.siteName || '-'}`);
  }

  const song = [i.recipientName, i.occasion, i.style, i.voiceArtist].filter(Boolean).join(' · ');
  if (song) lines.push(`Melodie: ${song}`);

  if (i.experienceSlug) lines.push(`Interfață: ${i.experienceSlug}`);

  // Identificatorii, la final: rar citiți pe telefon, dar necesari la investigație.
  const ids = [
    i.generationId ? `comandă ${i.generationId.slice(0, 8)}` : null,
    `plată ${i.paymentId.slice(0, 8)}`,
  ]
    .filter(Boolean)
    .join(' · ');
  lines.push(ids);

  return lines.join('\n');
}
