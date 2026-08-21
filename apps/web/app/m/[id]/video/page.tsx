'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useExperience } from '@/lib/experience-context';
import CadouVideoPage from '@/experiences/cadou/VideoPage';

export default function GenerationVideoPage() {
  const exp = useExperience();
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    if (exp.slug !== 'cadou' && params?.id) {
      router.replace(`/m/${params.id}`);
    }
  }, [exp.slug, params?.id, router]);

  if (exp.slug === 'cadou') return <CadouVideoPage />;
  return null;
}
