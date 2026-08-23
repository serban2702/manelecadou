'use client';

import { Badge } from '@/components/ui/badge';
import { useExperiences, DEFAULT_EXPERIENCE_SLUG } from '@/lib/hooks/use-experiences';

/**
 * Badge mic cu interfața (designul) pe care a rulat comanda/plata.
 *
 * Rândurile de dinaintea interfețelor au `experienceSlug` NULL — le afișăm ca
 * `classic`, singurul design existent atunci (aceeași regulă ca în API, vezi
 * `experience-sql.ts`), ca lista să nu depindă de scriptul de backfill.
 */
export function ExperienceBadge({ slug }: { slug: string | null | undefined }) {
  const { labelOf } = useExperiences();
  const key = slug && slug.trim() ? slug.trim() : DEFAULT_EXPERIENCE_SLUG;
  return (
    <Badge
      variant={key === DEFAULT_EXPERIENCE_SLUG ? 'muted' : 'info'}
      className="whitespace-nowrap text-[10px]"
      title={slug ? `Interfață: ${key}` : 'Comandă de dinaintea interfețelor — tratată ca classic'}
    >
      {labelOf(key)}
    </Badge>
  );
}
