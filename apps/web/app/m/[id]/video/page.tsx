'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useExperience } from '@/lib/experience-context';
// Lazy, ca `registry.ts`: importat static, codul + CSS-ul interfeței `cadou`
// (~62 kB de temă) ar intra în chunk-ul rutei și pe site-urile care rulează
// `classic`, unde ramura de mai jos nu se atinge niciodată.
const CadouVideoPage = dynamic(() => import('@/experiences/cadou/VideoPage'));

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
