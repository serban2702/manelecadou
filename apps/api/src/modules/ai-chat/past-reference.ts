/**
 * Două funcții pure folosite de agentul de chat (Irina), ținute separat ca să fie
 * testabile fără să pornească graful NestJS.
 */

/** Normalizare „slabă": fără diacritice, minuscule, spații colapsate. */
export function normLoose(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9@.]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Tipare prin care clientul se referă la o discuție/comandă ANTERIOARĂ, care nu
 * e în firul curent: „unde e comanda mea", „am vorbit ieri", „v-am scris deja".
 *
 * Există pentru că o conversație nouă (alt tab, alt device, cookie pierdut —
 * vezi §10.3.2) pornește goală, iar clientul continuă de unde crede el că a
 * rămas. Fără istoricul vechi, Irina îi cere de la zero date pe care le-a dat
 * deja, iar omul crede că nu-l ascultă nimeni.
 *
 * Deliberat CONSERVATOR: doar referiri explicite la trecut sau la o comandă
 * existentă. Un fals pozitiv costă tokeni și, mai rău, aduce în context o
 * conversație care poate fi a altcuiva (vezi garda de IP din
 * `loadPriorConversations`).
 */
export function referencesPastConversation(raw: string): boolean {
  const t = normLoose(raw);
  if (!t) return false;
  const patterns: RegExp[] = [
    // discuție anterioară
    /\bam (mai )?(vorbit|discutat|scris)\b/,
    // `normLoose` transformă cratimele în spații, deci „mi-ați zis" ajunge aici
    // ca „mi ati zis" — tiparele trebuie să accepte spațiul, nu cratima.
    /\b(v ?am|ti ?am|va ?m) (scris|zis|spus|trimis)\b/,
    /\b(mi ?ai|mi ?ati|mi ?a) (zis|spus|promis|trimis)\b/,
    /\b(data|saptamana|luna) trecut[aă]\b/,
    /\b(ieri|alaltaieri|azi dimineata|mai devreme|acum cateva zile|zilele trecute)\b/,
    /\bam (revenit|ramas)\b/,
    /\bcum (ramane|a ramas)\b/,
    // comandă existentă
    /\bam (comandat|platit|cumparat|achitat|facut comanda)\b/,
    /\b(comanda|melodia|maneaua|piesa|cantecul) mea\b/,
    /\bunde (e|este|mi e) (comanda|melodia|maneaua|piesa)\b/,
    /\bnu am (primit|mai primit)\b/,
  ];
  return patterns.some((re) => re.test(t));
}
