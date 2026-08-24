/**
 * URL de DESCĂRCARE pentru un fișier din `/uploads/...`.
 *
 * De ce nu e de ajuns atributul HTML `download`: cu fișierele mutate pe
 * Cloudflare R2 și un domeniu public pe bucket, `/uploads/...` răspunde cu
 * **302 către alt origin**, iar specul spune că `download` se ignoră după un
 * redirect cross-origin. Butonul „Descarcă maneaua" ar deschide fișierul
 * într-un tab în loc să-l salveze — o regresie pe care ar fi adus-o chiar
 * migrarea pe R2.
 *
 * `?download=1` îi cere API-ului să streameze fișierul cu
 * `Content-Disposition: attachment` în loc să redirecteze (vezi
 * `apps/api/src/main.ts`). Nu punem `Content-Disposition` pe obiectele din
 * bucket, pentru că aceleași fișiere sunt și sursa pentru `<audio>`/`<video>`
 * și trebuie să rămână redabile inline.
 *
 * Pentru orice altceva decât `/uploads/...` (URL extern, blob) întoarcem
 * sursa neatinsă.
 */
export function downloadUrl(src: string, filename?: string): string {
  if (!src) return src;
  try {
    const u = new URL(src, 'http://local');
    if (!u.pathname.startsWith('/uploads/')) return src;
    u.searchParams.set('download', '1');
    if (filename) u.searchParams.set('name', filename);
    // Same-origin: păstrăm doar path + query, ca să meargă și pe dev (rewrite),
    // și în producție (routerul trimite /uploads la api).
    return `${u.pathname}${u.search}`;
  } catch {
    return src;
  }
}
