'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

export type CadouTestimonial = { id: string; quote: string; name: string; role: string };

/**
 * Testimonialele default ale interfeței Cadou. Textele stau în
 * `cadou.testimonials.<id>` — aici rămân doar ID-urile. Adminul le poate
 * înlocui prin `catalog.testimonials`.
 */
const IDS = ['costel', 'andreea', 'vasile', 'geta', 'robert', 'maria'] as const;

/**
 * Textele se citesc prin `useTranslations`, în componenta care randează — nu
 * dintr-o constantă de modul: pe server modulele sunt partajate între cereri,
 * deci o stare globală „armată" înainte de randare poate ajunge la vizitatorul
 * altui site, în altă limbă.
 */
export function useCadouTestimonials(): CadouTestimonial[] {
  const t = useTranslations('cadou.testimonials');
  return useMemo(
    () =>
      IDS.map((id) => ({
        id,
        quote: t(`${id}.quote` as never),
        name: t(`${id}.name` as never),
        role: t(`${id}.role` as never),
      })),
    [t],
  );
}
