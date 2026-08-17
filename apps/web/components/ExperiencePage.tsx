'use client';

import { useExperience } from '@/lib/experience-context';

export function ExperienceHomePage() {
  const { HomePage } = useExperience();
  return <HomePage />;
}

export function ExperienceStudioPage() {
  const { StudioPage } = useExperience();
  return <StudioPage />;
}

export function ExperienceSongView() {
  const { SongView } = useExperience();
  return <SongView />;
}
