import manifest from './optimized-images.json';

/**
 * Imaginile statice pregătite de `scripts/optimize-images.mjs`: ce variante au
 * și ce dimensiuni intrinseci.
 *
 * Verificarea apartenenței nu e o precauție teoretică. Într-un `<picture>`,
 * browserul alege `<source>`-ul după `type`, nu după existența fișierului: un
 * AVIF declarat dar lipsă nu cade elegant pe JPEG, ci lasă imaginea ruptă. Iar o
 * parte din surse vin din baza de date (`style.artUrl`, coperți încărcate din
 * admin), deci nu se poate presupune că orice `.jpg` are variante.
 */
type Entry = { w: number | null; h: number | null; bytes: number; avif: number; webp: number };

const OPTIMIZED = manifest as Record<string, Entry>;

export type ImageVariants = {
  avif: string;
  webp: string;
  width: number | null;
  height: number | null;
};

/** Variantele + dimensiunile pentru o cale statică locală, sau `null`. */
export function variantsOf(src: string | null | undefined): ImageVariants | null {
  if (!src) return null;
  const e = OPTIMIZED[src];
  if (!e) return null;
  const base = src.replace(/\.(jpe?g|png)$/i, '');
  return { avif: `${base}.avif`, webp: `${base}.webp`, width: e.w, height: e.h };
}

/**
 * Valoare pentru `background-image`, cu formatele moderne întâi.
 *
 * Fundalurile nu pot trece prin `<picture>`, deci negocierea se face cu
 * `image-set()`. Se folosește ÎMPREUNĂ cu un `background-image: url(...)` scris
 * înainte, ca fallback: un browser care nu cunoaște `image-set()` ignoră
 * declarația întreagă și rămâne pe cea dinainte. Pentru stiluri inline — unde
 * nu poți avea două declarații ale aceleiași proprietăți — folosim două custom
 * properties plus un `@supports`; vezi `.cadou-style` din
 * `experiences/cadou/theme.css`.
 *
 * Pentru o sursă fără variante (URL din baza de date) întoarce un `url()`
 * simplu, deci e sigur de folosit necondiționat.
 */
export function cssImageSet(src: string): string {
  const v = variantsOf(src);
  if (!v) return `url("${src}")`;
  return `image-set(url("${v.avif}") type("image/avif"), url("${v.webp}") type("image/webp"), url("${src}") type("image/jpeg"))`;
}
