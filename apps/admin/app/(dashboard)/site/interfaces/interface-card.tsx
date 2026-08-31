'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
import type { SiteDto } from '@/lib/api/sites.api';
import { useToast } from '@/components/ui/use-toast';
import {
  canDisable,
  defaultSlugOf,
  experienceUrl,
  hasOwnCatalog,
  humanExperienceLabel,
  isEnabled,
  itemOf,
  packageOverrideCount,
  patchItem,
  setDefaultSlug,
} from './config';

export function InterfaceCard({
  slug,
  apiLabel,
  form,
  setForm,
  onOpen,
}: {
  slug: string;
  apiLabel: string;
  form: SiteDto;
  setForm: (f: SiteDto) => void;
  onOpen: () => void;
}) {
  const item = itemOf(form, slug);
  const isDefault = defaultSlugOf(form) === slug;
  const enabled = isEnabled(form, slug);
  const lockedOn = !canDisable(form, slug);
  const utmCount = item.utmRules?.filter((r) => r.source || r.campaign || r.content).length ?? 0;
  const own = hasOwnCatalog(item.catalog);
  const pkgCount = packageOverrideCount(item.packages);
  const title = humanExperienceLabel(slug, apiLabel);
  const url = experienceUrl(form.domain, slug, isDefault);
  const { toast } = useToast();

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn('cursor-pointer transition-colors hover:border-primary/40', isDefault && 'ring-1 ring-primary/30')}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold truncate">{title}</span>
              {isDefault && <Badge variant="default">Implicită</Badge>}
              {!enabled && <Badge variant="warning">Oprită</Badge>}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {slug === 'classic' ? 'Generator clasic' : slug === 'cadou' ? 'Landing cadou' : 'Mini-website'}
            </span>
            {/* Adresa la care se vede interfața. Pentru cea implicită e chiar
                homepage-ul; pentru restul, linkul cu `?ui=` — singurul mod de a
                le deschide cât timp nu sunt implicite. Oprită de tot, linkul nu
                face nimic: `?ui=` trece prin aceeași verificare de activare. */}
            <div
              className="mt-1 flex items-center gap-1 min-w-0"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                title={enabled ? url : `${url} — interfața e oprită, linkul nu o deschide`}
                className={cn(
                  'text-[11px] font-mono truncate underline decoration-dotted underline-offset-2',
                  enabled ? 'text-muted-foreground hover:text-primary' : 'text-muted-foreground/50',
                )}
              >
                {url.replace(/^https:\/\//, '')}
              </a>
              <button
                type="button"
                title="Copiază linkul"
                aria-label="Copiază linkul"
                className="shrink-0 text-[11px] text-muted-foreground hover:text-primary px-1"
                onClick={() => {
                  void navigator.clipboard?.writeText(url);
                  toast({ title: 'Link copiat', description: url });
                }}
              >
                ⧉
              </button>
            </div>
          </div>
          <div
            className="shrink-0 flex flex-col items-end gap-1.5"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {/* Classic capătă comutatorul doar cât timp altcineva poate ține
                site-ul în picioare — altfel rămâne aprins și blocat, cu motivul
                în tooltip. Vezi `canDisable`. */}
            <label
              className={cn(
                'flex items-center gap-2 text-xs text-muted-foreground',
                lockedOn ? 'cursor-not-allowed' : 'cursor-pointer',
              )}
              title={
                lockedOn
                  ? 'Classic e plasa de siguranță a site-ului. Se poate opri doar după ce altă interfață devine implicită.'
                  : undefined
              }
            >
              <span>Disponibilă</span>
              <Switch
                checked={enabled}
                disabled={lockedOn}
                onCheckedChange={(on) => setForm(patchItem(form, slug, { enabled: on }))}
              />
            </label>
            {!isDefault && (
              <button
                type="button"
                className="text-[11px] text-primary hover:underline"
                onClick={() => setForm(setDefaultSlug(form, slug))}
              >
                Folosește ca implicită
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <MetaChip>
            {utmCount === 0 ? 'fără UTM' : `${utmCount} ${utmCount === 1 ? 'regulă UTM' : 'reguli UTM'}`}
          </MetaChip>
          <MetaChip tone={own ? 'own' : 'inherit'}>{own ? 'catalog propriu' : 'catalog moștenit'}</MetaChip>
          <MetaChip>
            {pkgCount === 0
              ? 'pachete moștenite'
              : `${pkgCount} ${pkgCount === 1 ? 'pachet propriu' : 'pachete proprii'}`}
          </MetaChip>
        </div>
      </CardContent>
    </Card>
  );
}

function MetaChip({ children, tone }: { children: string; tone?: 'own' | 'inherit' }) {
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5',
        tone === 'own' && 'bg-primary/15 text-primary',
        tone === 'inherit' && 'bg-secondary text-muted-foreground',
        !tone && 'bg-secondary text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}
