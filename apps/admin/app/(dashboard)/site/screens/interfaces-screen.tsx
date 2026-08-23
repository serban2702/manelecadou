'use client';

import { useEffect, useState } from 'react';
import { SitesApi, type SiteDto } from '@/lib/api/sites.api';
import type { SiteDemo } from '@/lib/api/site-demos.api';
import { useSpaNavigate, useSpaPathname } from '@/lib/spa-router';
import { cn } from '@/lib/cn';
import { StudioSection } from '../studio-primitives';
import { matchStudioPath } from '../studio-nav';
import { InterfaceCard } from '../interfaces/interface-card';
import { InterfaceStudio } from '../interfaces/interface-studio';
import {
  FALLBACK_EXPERIENCES,
  defaultSlugOf,
  humanExperienceLabel,
  setDefaultSlug,
} from '../interfaces/config';

export function InterfacesScreen({
  form,
  setForm,
  demos,
}: {
  form: SiteDto;
  setForm: (f: SiteDto) => void;
  demos: SiteDemo[];
}) {
  const navigate = useSpaNavigate();
  const pathname = useSpaPathname();
  const slug = matchStudioPath(pathname).interfaceSlug;
  const [catalog, setCatalog] = useState<Array<{ slug: string; label: string }>>(FALLBACK_EXPERIENCES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    SitesApi.listExperiences()
      .then((rows) => {
        if (rows?.length) setCatalog(rows);
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded || !slug) return;
    if (!catalog.some((c) => c.slug === slug)) {
      navigate('/site/interfaces', { replace: true });
    }
  }, [loaded, slug, catalog, navigate]);

  if (slug) {
    const entry = catalog.find((c) => c.slug === slug);
    if (!entry) return null;
    return (
      <InterfaceStudio
        form={form}
        setForm={setForm}
        slug={slug}
        apiLabel={entry.label}
        demos={demos}
        onBack={() => navigate('/site/interfaces')}
      />
    );
  }

  const defaultSlug = defaultSlugOf(form);

  return (
    <div className="grid gap-6" data-field="interfaces">
      <StudioSection
        title="Interfețe (design)"
        help="Aici se configurează tot ce vede clientul: pachete, prețuri, stiluri, ocazii, voci, surse Suno/Google. Tenant-ul de mai sus e doar domeniul și branding-ul."
      >
        <div
          className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3"
          data-field="interfaces.default"
        >
          <div>
            <div className="text-sm font-semibold">Ce văd vizitatorii noi</div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              Implicită = homepage-ul pe {form.domain || 'domeniu'}, fără <code>?ui=</code>.
              „Activă” înseamnă doar că interfața poate fi deschisă din ads. După schimbare, apasă{' '}
              <strong>Salvează</strong>, apoi testează într-o fereastră incognito nouă.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {catalog.map((c) => {
              const selected = defaultSlug === c.slug;
              return (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => setForm(setDefaultSlug(form, c.slug))}
                  className={cn(
                    'rounded-md border px-3 py-2 text-sm transition-colors',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:border-primary/50',
                  )}
                >
                  {humanExperienceLabel(c.slug, c.label)}
                  {selected ? ' · implicită' : ''}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {catalog.map((c) => (
            <InterfaceCard
              key={c.slug}
              slug={c.slug}
              apiLabel={c.label}
              form={form}
              setForm={setForm}
              onOpen={() => navigate(`/site/interfaces/${c.slug}`)}
            />
          ))}
        </div>
      </StudioSection>
    </div>
  );
}
