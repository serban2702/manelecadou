'use client';

import type { ComponentType, ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Globe,
  LayoutTemplate,
  Music2,
  Shield,
  Sparkles,
  VolumeX,
} from 'lucide-react';
import type { SiteDto } from '@/lib/api/sites.api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useSpaNavigate } from '@/lib/spa-router';
import { cn } from '@/lib/cn';
import { humanExperienceLabel } from '../interfaces/config';
import { highlightStudioField, setStudioFocus, type StudioFocus } from '../studio-nav';
import { StudioSection } from '../studio-primitives';

type Engine = 'suno' | 'google';

interface PromptEntry {
  id: string;
  nm?: string;
  sunoPrompt?: string;
  googlePrompt?: string;
}

/** O sursă de catalog care ajunge efectiv la generator. */
interface CatalogSource {
  key: string;
  /** „Librărie" sau „Design Cadou". */
  label: string;
  engine: Engine;
  href: string;
  /** true = librăria tenantului (are ecran de catalog cu focus pe intrare). */
  tenant: boolean;
  styles: PromptEntry[];
  occasions: PromptEntry[];
}

interface PromptGap {
  source: CatalogSource;
  kind: 'styles' | 'occasions';
  missing: PromptEntry[];
}

function engineName(e: Engine): string {
  return e === 'google' ? 'Google Lyria' : 'Suno';
}

function missingPrompt(items: PromptEntry[], e: Engine): PromptEntry[] {
  return items.filter((i) => !(e === 'google' ? i.googlePrompt : i.sunoPrompt)?.trim());
}

/**
 * Librăria tenantului + catalogul propriu al fiecărui design activ.
 * Un design care moștenește catalogul nu apare separat (n-are ce fi gol în plus).
 * Fără partea de design-uri, Overview zicea „Nimic critic" pe un site cu Cadou
 * pe catalog propriu și googlePrompt gol, în timp ce /rollout zicea „Lipsește".
 */
function catalogSources(form: SiteDto, siteEngine: Engine): CatalogSource[] {
  const out: CatalogSource[] = [
    {
      key: 'tenant',
      label: 'Librărie',
      engine: siteEngine,
      href: '/site/catalog/styles',
      tenant: true,
      styles: form.styles ?? [],
      occasions: form.occasions ?? [],
    },
  ];
  for (const [slug, item] of Object.entries(form.experienceConfig?.items ?? {})) {
    if (!item || item.enabled === false) continue;
    const styles = item.catalog?.styles ?? [];
    const occasions = item.catalog?.occasions ?? [];
    if (styles.length === 0 && occasions.length === 0) continue;
    out.push({
      key: `ui:${slug}`,
      label: `Design ${humanExperienceLabel(slug)}`,
      engine: item.musicEngine === 'google' || item.musicEngine === 'suno' ? item.musicEngine : siteEngine,
      href: `/site/interfaces/${slug}`,
      tenant: false,
      styles,
      occasions,
    });
  }
  return out;
}

export function OverviewScreen({
  form,
  dirtyCount,
}: {
  form: SiteDto;
  dirtyCount: number;
}) {
  const navigate = useSpaNavigate();
  const engine: Engine = form.musicEngine === 'google' ? 'google' : 'suno';
  const defaultUi = form.experienceConfig?.defaultSlug ?? 'classic';
  const styles = form.styles ?? [];
  const occasions = form.occasions ?? [];
  const voices = form.voices ?? [];

  const sources = catalogSources(form, engine);
  const gaps: PromptGap[] = [];
  for (const source of sources) {
    const missStyles = missingPrompt(source.styles, source.engine);
    if (missStyles.length > 0) gaps.push({ source, kind: 'styles', missing: missStyles });
    const missOccasions = missingPrompt(source.occasions, source.engine);
    if (missOccasions.length > 0) gaps.push({ source, kind: 'occasions', missing: missOccasions });
  }
  const styleGaps = gaps.filter((g) => g.kind === 'styles');
  const occasionGaps = gaps.filter((g) => g.kind === 'occasions');
  // Un design poate rula pe alt motor decât tenantul — numim toate motoarele active.
  const engineLabel = [...new Set(sources.map((s) => s.engine))].map(engineName).join(' / ');

  function gapFocus(gap: PromptGap): { focus?: StudioFocus; field?: string } {
    const promptKey = gap.source.engine === 'google' ? 'googlePrompt' : 'sunoPrompt';
    if (!gap.source.tenant) return { field: 'interfaces.catalog' };
    const catalogKind = gap.kind;
    return {
      focus: {
        fieldId: gap.kind === 'styles' ? `catalog.style.${promptKey}` : `catalog.occasion.${promptKey}`,
        catalogKind,
        catalogId: gap.missing[0]?.id,
      },
    };
  }

  function gapHref(gap: PromptGap): string {
    if (!gap.source.tenant) return gap.source.href;
    return gap.kind === 'styles' ? '/site/catalog/styles' : '/site/catalog/occasions';
  }

  const status = form.hiddenMode
    ? { label: 'Ascuns', variant: 'destructive' as const, hint: 'Vizitatorul crede că site-ul nu există.' }
    : form.maintenanceMode
      ? { label: 'Mentenanță', variant: 'warning' as const, hint: 'Vizitatorii văd pagina brandită.' }
      : form.active
        ? { label: 'Activ', variant: 'success' as const, hint: 'Site-ul e live.' }
        : { label: 'Inactiv', variant: 'muted' as const, hint: 'Nu e servit ca tenant activ.' };

  function go(href: string, focus?: StudioFocus, field?: string) {
    if (focus) setStudioFocus(focus);
    navigate(href);
    if (field) highlightStudioField(field);
  }

  const fromEmail = (form.fromEmail || form.mailConfig?.fromEmail || '').trim();
  const firstStyleGap = styleGaps[0];
  const firstOccasionGap = occasionGaps[0];
  const launch: Array<{
    ok: boolean;
    label: string;
    href: string;
    focus?: StudioFocus;
    field?: string;
  }> = [
    { ok: !!form.domain?.trim(), label: 'Domeniu setat', href: '/site/identity' },
    { ok: !!form.sslEnabled, label: 'HTTPS pornit', href: '/site/operations' },
    {
      ok: form.active && !form.hiddenMode && !form.maintenanceMode,
      label: 'Site vizibil pentru clienți',
      href: '/site/operations',
    },
    { ok: !!form.brand?.logoUrl, label: 'Logo încărcat', href: '/site/appearance' },
    { ok: !!fromEmail, label: 'Expeditor de email', href: '/site/operations' },
    {
      ok: styles.length > 0 && styleGaps.length === 0,
      label: `Prompt ${engineLabel} pe stiluri`,
      href: firstStyleGap ? gapHref(firstStyleGap) : '/site/catalog/styles',
      ...(firstStyleGap ? gapFocus(firstStyleGap) : {}),
    },
    {
      ok: occasions.length > 0 && occasionGaps.length === 0,
      label: `Prompt ${engineLabel} pe ocazii`,
      href: firstOccasionGap ? gapHref(firstOccasionGap) : '/site/catalog/occasions',
      ...(firstOccasionGap ? gapFocus(firstOccasionGap) : {}),
    },
  ];
  const launchLeft = launch.filter((x) => !x.ok).length;

  const alerts: Array<{
    key: string;
    href: string;
    title: string;
    body: string;
    focus?: StudioFocus;
    field?: string;
  }> = [];
  if (form.demoEnabled === false) {
    alerts.push({
      key: 'demo',
      href: '/site/prices',
      title: 'Plată înainte de demo',
      body: 'Demo 30s e oprit. Clientul plătește înainte de generare.',
    });
  }
  for (const gap of gaps) {
    const what = gap.kind === 'styles' ? 'stiluri' : 'ocazii';
    alerts.push({
      key: `${gap.source.key}:${gap.kind}`,
      href: gapHref(gap),
      title: `${gap.source.label}: prompt ${engineName(gap.source.engine)} lipsă pe ${gap.missing.length} ${what}`,
      body: gap.missing.map((x) => x.nm || x.id).slice(0, 6).join(', '),
      ...gapFocus(gap),
    });
  }
  const anyPkg = Object.values(form.experienceConfig?.items ?? {}).some(
    (it) => it?.packages && Object.keys(it.packages).length > 0,
  );
  if (!anyPkg) {
    alerts.push({
      key: 'packages',
      href: '/site/interfaces',
      title: 'Pachetele se setează pe interfață',
      body: 'Standard / Plus / Premium (preț, refaceri, colaj) sunt pe Interfețe → un design, nu la Plată.',
    });
  }
  if (dirtyCount > 0) {
    alerts.push({
      key: 'dirty',
      href: '/site',
      title: `${dirtyCount} modificări nesalvate`,
      body: 'Salvează din bara de sus sau Renunță ca să revii la ultima versiune.',
    });
  }

  return (
    <div className="grid gap-6 scroll-mt-24" data-field="overview">
      <StudioSection
        title="Lansare"
        help="Checklist pentru un site nou. Bifele verzi sunt gata; restul duc la ecranul care le repară."
      >
        <Card>
          <CardContent className="p-3 space-y-1">
            {launch.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => go(item.href, item.focus, item.field)}
                className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary/50"
              >
                {item.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-amber-400 shrink-0" />
                )}
                <span className={item.ok ? 'text-muted-foreground' : 'text-foreground'}>{item.label}</span>
              </button>
            ))}
            {launchLeft === 0 && (
              <p className="text-[11px] text-muted-foreground px-2 pt-1">Gata de lansare pe punctele de bază.</p>
            )}
          </CardContent>
        </Card>
      </StudioSection>

      <StudioSection title="Stare" help="Citit din formularul curent — nu e un dashboard separat.">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          <HealthCard
            icon={Globe}
            label="Domeniu"
            value={form.domain}
            onClick={() => go('/site/identity')}
            extra={
              <Badge variant={form.sslEnabled ? 'success' : 'warning'}>
                {form.sslEnabled ? 'HTTPS pornit' : 'HTTPS oprit'}
              </Badge>
            }
          />
          <HealthCard
            icon={status.variant === 'success' ? CheckCircle2 : AlertTriangle}
            label="Vizibilitate"
            value={status.label}
            hint={status.hint}
            onClick={() => go('/site/operations')}
            tone={status.variant}
          />
          <HealthCard
            icon={Sparkles}
            label="Motor audio"
            value={engine === 'google' ? 'Google Lyria 3 Pro' : 'Suno'}
            onClick={() => go('/site/generation')}
          />
          <HealthCard
            icon={LayoutTemplate}
            label="Interfață implicită"
            value={humanExperienceLabel(defaultUi)}
            onClick={() => go('/site/interfaces')}
          />
          <HealthCard
            icon={Music2}
            label="Catalog"
            value={`${styles.length} stiluri · ${occasions.length} ocazii · ${voices.length} voci`}
            onClick={() => go('/site/catalog/styles')}
          />
          <HealthCard
            icon={form.demoEnabled === false ? VolumeX : Shield}
            label="Flux plată"
            value={form.demoEnabled === false ? 'Plată înainte' : 'Demo 30s, apoi plată'}
            onClick={() => go('/site/prices')}
          />
        </div>
      </StudioSection>

      <StudioSection
        title="De reparat"
        help="Alerte calculate din formularul curent — librăria tenantului plus catalogul propriu al fiecărui design activ, ca în /rollout. Click duce la ecranul care le rezolvă."
      >
        {alerts.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Nimic critic. Prompturile motorului activ sunt complete — și în librărie, și pe
              cataloagele proprii ale design-urilor.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2">
            {alerts.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => go(a.href, a.focus, a.field)}
                className="block text-left rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 hover:border-primary/40 transition-colors"
              >
                <div className="text-sm font-medium text-amber-200">{a.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{a.body}</div>
              </button>
            ))}
          </div>
        )}
      </StudioSection>
    </div>
  );
}

function HealthCard({
  icon: Icon,
  label,
  value,
  hint,
  onClick,
  extra,
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  onClick: () => void;
  extra?: ReactNode;
  tone?: 'success' | 'warning' | 'destructive' | 'muted';
}) {
  return (
    <button type="button" onClick={onClick} className="block text-left w-full">
      <Card className="h-full hover:border-primary/40 transition-colors">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </div>
            {extra}
          </div>
          <div
            className={cn(
              'text-sm font-medium truncate',
              tone === 'success' && 'text-emerald-300',
              tone === 'warning' && 'text-amber-300',
              tone === 'destructive' && 'text-destructive',
              tone === 'muted' && 'text-muted-foreground',
            )}
          >
            {value}
          </div>
          {hint && <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>}
        </CardContent>
      </Card>
    </button>
  );
}
