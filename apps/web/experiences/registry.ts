import dynamic from 'next/dynamic';
import { DEFAULT_EXPERIENCE_SLUG, isKnownExperienceSlug } from './catalog';
import type { ExperienceModule } from './types';

/**
 * Registrul e consumat din `lib/experience-context.tsx`, care stă în layout-ul
 * rădăcină — deci orice import STATIC de aici ajunge în chunk-ul partajat de
 * toate rutele. Cu ambele interfețe importate static, un site care rulează doar
 * `classic` descărca și codul + CSS-ul interfeței `cadou` (și invers).
 *
 * Fiecare interfață se încarcă acum prin `next/dynamic`, cu `ssr` implicit
 * `true`: webpack îi dă chunk propriu (JS + CSS), dar paginile rămân randate pe
 * server, deci conținutul e în HTML-ul inițial (SEO) și nu apare flicker.
 * `next/dynamic` cu `ssr: true` și fără `loading` nu introduce nici măcar o
 * graniță `Suspense`, iar la SSR emite `<link rel="stylesheet">` pentru CSS-ul
 * chunk-ului (vezi `PreloadChunks` din next) — deci nici FOUC.
 *
 * `import()`-ul trebuie să rămână INLINE în apelul `dynamic()`: transformarea
 * SWC `next-dynamic` de acolo extrage id-ul modulului pentru manifestul de
 * loadable, care e exact ce alimentează preîncărcarea CSS-ului la SSR.
 * Apelurile multiple către același `import()` partajează un singur chunk.
 */
const REGISTRY: Record<string, ExperienceModule> = {
  classic: {
    slug: 'classic',
    label: 'Classic',
    HomePage: dynamic(() => import('./classic').then((m) => m.classicExperience.HomePage)),
    StudioPage: dynamic(() => import('./classic').then((m) => m.classicExperience.StudioPage)),
    SongView: dynamic(() => import('./classic').then((m) => m.classicExperience.SongView)),
    // `classic` nu are chrome propriu — `components/SiteShell.tsx` verifică
    // `exp.Shell` și, când lipsește, randează header/footer-ul clasic. Câmpul
    // TREBUIE să rămână literalmente absent (nu un component lazy gol).
  },
  cadou: {
    slug: 'cadou',
    label: 'Cadou',
    HomePage: dynamic(() => import('./cadou').then((m) => m.cadouExperience.HomePage)),
    StudioPage: dynamic(() => import('./cadou').then((m) => m.cadouExperience.StudioPage)),
    SongView: dynamic(() => import('./cadou').then((m) => m.cadouExperience.SongView)),
    Shell: dynamic(() => import('./cadou').then((m) => m.cadouExperience.Shell!)),
  },
};

export function getExperience(slug: string | null | undefined): ExperienceModule {
  if (slug && REGISTRY[slug]) return REGISTRY[slug];
  return REGISTRY[DEFAULT_EXPERIENCE_SLUG];
}

export function isRegisteredExperience(slug: string | null | undefined): boolean {
  return !!slug && !!REGISTRY[slug] && isKnownExperienceSlug(slug);
}

export { REGISTRY };
