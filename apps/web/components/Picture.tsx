/* eslint-disable @next/next/no-img-element */
import { variantsOf } from '@/lib/static-image';

type Props = {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  /** Imagine din primul ecran: se încarcă imediat și cu prioritate. */
  priority?: boolean;
  sizes?: string;
};

/**
 * `<img>` cu variante AVIF/WebP când există, plus lazy-loading implicit.
 *
 * Nu folosim `next/image`: o parte din imaginile interfeței sunt
 * `background-image` în CSS, unde nu ajunge, iar optimizarea lui la runtime ar
 * costa CPU pe container la fiecare vizitator. Variantele sunt pregenerate și
 * commit-uite (`scripts/optimize-images.mjs`), deci aici rămâne doar alegerea.
 *
 * `width`/`height` se completează singure din manifest, cu dimensiunile
 * INTRINSECI ale sursei. Nu fixează mărimea afișată (CSS-ul o face), dar dau
 * browserului raportul de aspect din primul moment, ca layoutul să nu sară când
 * sosește imaginea. Le poți trece explicit dacă ai nevoie de altceva.
 */
export function Picture({ src, alt, className, width, height, priority, sizes }: Props) {
  const v = variantsOf(src);
  const img = (
    <img
      src={src}
      alt={alt}
      className={className}
      width={width ?? v?.width ?? undefined}
      height={height ?? v?.height ?? undefined}
      sizes={sizes}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'auto' : 'async'}
      fetchPriority={priority ? 'high' : undefined}
    />
  );
  if (!v) return img;
  return (
    <picture>
      <source srcSet={v.avif} type="image/avif" sizes={sizes} />
      <source srcSet={v.webp} type="image/webp" sizes={sizes} />
      {img}
    </picture>
  );
}
