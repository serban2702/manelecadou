'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Star } from 'lucide-react';
import type { SiteDto } from '@/lib/api/sites.api';
import type { SiteDemo } from '@/lib/api/site-demos.api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/use-toast';
import { Field, StudioSection, Toggle } from '../studio-primitives';
import { ExperienceCatalogEditor } from './experience-catalog-editor';
import { InheritToggle } from './inherit-toggle';
import { PackagesEditor } from './packages-editor';
import { ReactionClipsEditor } from './reaction-clips';
import { UtmRulesEditor } from './utm-rules';
import { TestimonialsSection } from '../testimonials-section';
import {
  CADOU_TESTI,
  copyCadouCatalog,
  effectiveCadouStyles,
  publicSiteAsset,
} from './cadou-defaults';
import {
  adsUiUrl,
  copyFromSite,
  defaultSlugOf,
  hasOwnCatalog,
  hasOwnTestimonials,
  humanExperienceLabel,
  isEnabled,
  itemOf,
  patchCatalog,
  patchItem,
  revertCatalogInherit,
  setDefaultSlug,
} from './config';

export function InterfaceStudio({
  form,
  setForm,
  slug,
  apiLabel,
  demos,
  onBack,
}: {
  form: SiteDto;
  setForm: (f: SiteDto) => void;
  slug: string;
  apiLabel: string;
  demos: SiteDemo[];
  onBack: () => void;
}) {
  const item = itemOf(form, slug);
  const catalog = item.catalog ?? {};
  const own = hasOwnCatalog(catalog);
  const ownTesti = hasOwnTestimonials(catalog);
  const isDefault = defaultSlugOf(form) === slug;
  const title = humanExperienceLabel(slug, apiLabel);
  const adsUrl = adsUiUrl(form.domain || 'example.com', slug);
  const showReactions = slug === 'cadou' || (catalog.reactionClips?.length ?? 0) > 0;
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [pickDemos, setPickDemos] = useState(false);

  useEffect(() => {
    setPickDemos(false);
  }, [slug]);

  const demoMode: 'all' | 'none' | 'pick' =
    pickDemos || ((catalog.demoIds?.length ?? 0) > 0)
      ? 'pick'
      : catalog.demoIds == null
        ? 'all'
        : 'none';

  async function revertInherit() {
    const ok = await confirmDialog({
      title: 'Revii la catalogul site-ului?',
      description:
        'Stilurile, ocaziile și vocile proprii se pierd. Writer, demo-uri și reacții rămân.',
      confirmText: 'Revino la moștenire',
      variant: 'destructive',
    });
    if (!ok) return;
    setForm(patchCatalog(form, slug, revertCatalogInherit));
  }

  function createOwn() {
    const copied = slug === 'cadou' ? copyCadouCatalog(form) : copyFromSite(form);
    if (!copied.styles?.length && !copied.occasions?.length && !copied.voices?.length) {
      toast({
        title: 'Catalogul e gol',
        description:
          slug === 'cadou'
            ? 'Nu am găsit stilurile default Cadou. Verifică librăria tenantului.'
            : 'Adaugă stiluri, ocazii sau voci la Catalog muzical, apoi copiază.',
      });
      return;
    }
    setForm(
      patchCatalog(form, slug, (c) => ({
        ...c,
        ...copied,
      })),
    );
  }

  return (
    // Ancoră per design (`interfaces.classic`, `interfaces.cadou`, …) ca să aibă
    // căutarea din studio unde să aterizeze când cauți un design după nume.
    <div className="grid gap-6 scroll-mt-24" data-field={`interfaces.${slug}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Button size="sm" variant="ghost" className="-ml-2 mb-1" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Toate interfețele
          </Button>
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Link ads: {adsUrl}
          </p>
        </div>
        {isDefault && (
          <span className="inline-flex items-center gap-1 text-xs text-primary bg-primary/15 rounded-md px-2 py-1">
            <Star className="h-3 w-3" />
            Implicită
          </span>
        )}
      </div>

      <StudioSection
        title="Activare"
        help={`Linkul de ads deschide direct această interfață, indiferent de campanie.`}
      >
        <Card>
          <CardContent className="p-4 space-y-3" data-field="interfaces.enabled">
            {slug !== 'classic' && (
              <Toggle
                label="Disponibilă din ads / UTM"
                description="Oprită = nu se alege din ads. Nu e același lucru cu implicita: homepage-ul rămâne pe interfața marcată Implicită. Linkul ?ui= de mai sus o deschide oricum."
                value={isEnabled(form, slug)}
                onChange={(on) => setForm(patchItem(form, slug, { enabled: on }))}
                fieldId="interfaces.enabled"
              />
            )}
            {slug === 'classic' && (
              <p className="text-sm text-muted-foreground">Classic e mereu disponibilă — e plasa de siguranță a site-ului.</p>
            )}
            <Button
              size="sm"
              variant={isDefault ? 'secondary' : 'default'}
              disabled={isDefault}
              onClick={() => setForm(setDefaultSlug(form, slug))}
              data-field="interfaces.default"
            >
              {isDefault ? 'E deja homepage-ul vizitatorilor noi' : 'Folosește ca implicită (apoi Salvează)'}
            </Button>
          </CardContent>
        </Card>
      </StudioSection>

      <StudioSection title="Reguli UTM" help="Source / campaign / content. O regulă se aplică dacă toate câmpurile completate se potrivesc.">
        <Card>
          <CardContent className="p-4">
            <UtmRulesEditor form={form} setForm={setForm} slug={slug} adsUrl={adsUrl} />
          </CardContent>
        </Card>
      </StudioSection>

      <StudioSection
        title="Motor audio"
        help="Suno sau Google, doar pe această interfață. Gol = motorul din Generare (site)."
      >
        <Card>
          <CardContent className="p-4" data-field="interfaces.engine">
            <select
              className="w-full max-w-sm bg-background border border-border rounded-md px-3 py-2 text-sm h-9"
              value={item.musicEngine === 'google' || item.musicEngine === 'suno' ? item.musicEngine : ''}
              onChange={(e) => {
                const v = e.target.value;
                setForm(
                  patchItem(form, slug, {
                    musicEngine: v === 'google' || v === 'suno' ? v : null,
                  }),
                );
              }}
            >
              <option value="">Ca la site ({form.musicEngine === 'google' ? 'Google' : 'Suno'})</option>
              <option value="suno">Suno</option>
              <option value="google">Google Lyria</option>
            </select>
          </CardContent>
        </Card>
      </StudioSection>

      <StudioSection
        title="Catalog (stiluri, ocazii, voci)"
        help="Aparțin acestei interfețe. Fiecare stil/ocazie are surse Suno și Google. Moștenire = librăria tenant-ului."
      >
        <div className="space-y-3" data-field="interfaces.catalog">
          <InheritToggle
            own={own}
            onCreateOwn={createOwn}
            onRevert={() => void revertInherit()}
            inheritTitle={slug === 'cadou' ? 'Setul default Cadou' : undefined}
            inheritHelp={
              slug === 'cadou'
                ? 'Homepage-ul arată 6 stiluri cu artă (De iubire, De jale, De pahar…). Editează-le aici ca să le schimbi fără să atingi librăria tenantului.'
                : undefined
            }
            createLabel={slug === 'cadou' ? 'Editează stilurile Cadou' : undefined}
          />
          {!own && slug === 'cadou' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {effectiveCadouStyles(form).map((s) => (
                <div
                  key={s.id}
                  className="relative overflow-hidden rounded-lg border border-border aspect-[16/10] bg-cover bg-center"
                  style={{ backgroundImage: `url(${publicSiteAsset(s.artUrl, form.domain)})` }}
                >
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-white truncate">
                      {s.nm}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {own && (
            <ExperienceCatalogEditor
              site={form}
              slug={slug}
              catalog={catalog}
              onChange={(next) => setForm(patchItem(form, slug, { catalog: next }))}
            />
          )}
        </div>
      </StudioSection>

      <StudioSection
        title="Pachete"
        help="Preț, durată și ce conține fiecare pachet pe această interfață: refaceri, colaj, poze, video, etc."
      >
        <PackagesEditor form={form} setForm={setForm} slug={slug} />
      </StudioSection>

      <StudioSection
        title="Testimoniale"
        help="Recenziile de pe homepage-ul acestui design. Moștenire = lista din Aspect (tenant)."
      >
        <div className="space-y-3" data-field="interfaces.testimonials">
          {!ownTesti ? (
            <Card className="border-dashed">
              <CardContent className="p-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">Moștenește de la tenant</div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    {slug === 'cadou' && !(form.testimonials ?? []).length
                      ? 'Homepage-ul Cadou folosește 6 recenzii default. Editează-le ca să le schimbi.'
                      : (form.testimonials ?? []).length === 0
                        ? 'Tenantul n-are recenzii — site-ul folosește fallback-ul din cod.'
                        : `${form.testimonials?.length} recenzii din Aspect.`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setForm(
                      patchCatalog(form, slug, (c) => ({
                        ...c,
                        testimonials:
                          (form.testimonials ?? []).length > 0
                            ? (form.testimonials ?? []).map((t) => ({ ...t }))
                            : slug === 'cadou'
                              ? CADOU_TESTI.map((t) => ({ ...t }))
                              : [],
                      })),
                    )
                  }
                >
                  Editează pentru acest design
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setForm(
                      patchCatalog(form, slug, (c) => {
                        const next = { ...c };
                        delete next.testimonials;
                        return next;
                      }),
                    )
                  }
                >
                  Revino la moștenire
                </Button>
              </div>
              <TestimonialsSection
                list={catalog.testimonials ?? []}
                onChange={(testimonials) =>
                  setForm(patchCatalog(form, slug, (c) => ({ ...c, testimonials })))
                }
                locale={form.locale}
                fieldId="interfaces.testimonials"
                embedded
              />
            </>
          )}
        </div>
      </StudioSection>

      <StudioSection title="Writer" help="Promptul de sistem pentru versuri pe această interfață.">
        <Card>
          <CardContent className="p-4" data-field="interfaces.writer">
            <Field
              label="Prompt writer"
              description="Gol = promptul de la Generare."
              fieldId="interfaces.writer"
            >
              <Textarea
                rows={5}
                className="font-mono text-xs"
                placeholder="Gol = promptul de la Generare."
                value={catalog.writerSystemPrompt ?? ''}
                onChange={(e) =>
                  setForm(
                    patchCatalog(form, slug, (c) => ({
                      ...c,
                      writerSystemPrompt: e.target.value,
                    })),
                  )
                }
              />
            </Field>
          </CardContent>
        </Card>
      </StudioSection>

      <StudioSection
        title="Demo-uri"
        help="Toate = demo-urile site-ului. Niciunul = popup gol (valid). Selectează = filtru."
      >
        <Card>
          <CardContent className="p-4 space-y-3" data-field="interfaces.demos">
            <div className="flex flex-wrap gap-3 text-sm">
              {(
                [
                  { id: 'all', label: 'Toate' },
                  { id: 'none', label: 'Niciunul' },
                  { id: 'pick', label: 'Selectează' },
                ] as const
              ).map((opt) => (
                <label key={opt.id} className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={`demos-${slug}`}
                    checked={demoMode === opt.id}
                    onChange={() => {
                      if (opt.id === 'all') setPickDemos(false);
                      else if (opt.id === 'none') setPickDemos(false);
                      else setPickDemos(true);
                      setForm(
                        patchCatalog(form, slug, (c) => {
                          if (opt.id === 'all') return { ...c, demoIds: null };
                          if (opt.id === 'none') return { ...c, demoIds: [] };
                          if (c.demoIds == null) return { ...c, demoIds: demos.map((d) => d.id) };
                          return c;
                        }),
                      );
                    }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {demoMode === 'pick' && (
              <div className="grid gap-1">
                {demos.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nu există demo-uri pe site. Adaugă-le din Demo-uri.</p>
                )}
                {demos.map((d) => {
                  const on = !!(catalog.demoIds ?? []).includes(d.id);
                  return (
                    <label key={d.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => {
                          const cur = catalog.demoIds ?? [];
                          const next = e.target.checked ? [...cur, d.id] : cur.filter((id) => id !== d.id);
                          setForm(patchCatalog(form, slug, (c) => ({ ...c, demoIds: next })));
                        }}
                      />
                      {d.title}
                    </label>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </StudioSection>

      {showReactions && (
        <StudioSection title="Reacții" help="TikTok / Instagram pe homepage-ul Cadou. Gol = setul default din UI.">
          <ReactionClipsEditor
            site={form}
            slug={slug}
            clips={catalog.reactionClips ?? []}
            demos={demos}
            busy={busy}
            onBusy={setBusy}
            onChange={(reactionClips) =>
              setForm(patchCatalog(form, slug, (c) => ({ ...c, reactionClips })))
            }
          />
        </StudioSection>
      )}
    </div>
  );
}
