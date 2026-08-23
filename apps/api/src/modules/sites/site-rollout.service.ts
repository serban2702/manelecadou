import { Injectable, NotFoundException } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { Site } from './site.entity';
import type { ExperienceCatalogConfig, SiteExperienceConfig, SiteExperienceItemConfig } from '../experiences/types';
import {
  SEEDED_LOCALES,
  normalizeSeedLocale,
  seedForLocale,
  seedRow,
  type CatalogPromptSeedMap,
  type CatalogPromptSeedSet,
} from './catalog-seed';
import { SitesService } from './sites.service';

/**
 * Registru de lansare pe producție.
 *
 * Când termini o lucrare (Lyria, interfață Cadou, pachete, etc.) și ceva trebuie
 * setat pe site-urile live, ADAUGĂ un obiect în ROLLOUT_CHECKS. Pagina admin
 * /rollout îl arată automat pe fiecare tenant. Dacă poți completa fără să
 * ștergi customizări, pune autoApply: true.
 *
 * Regula de aur la apply: umple doar goluri. Nu suprascrie prompturi, prețuri
 * sau experienceConfig deja scrise de operator. Nu comuta musicEngine pe Google
 * automat — ăla e un click conștient per site.
 *
 * A doua regulă: seed-ul are o limbă (vezi catalog-seed.ts). Se aplică DOAR pe
 * site-urile cu `site.locale` potrivit. Pe restul, check-ul raportează onest ce
 * lipsește și trimite operatorul în Catalog — nu scrie nimic. Fără garda asta,
 * „Aplică pe toate site-urile” injecta „mire și mireasă” în prompturile
 * site-ului bulgăresc, iar ăla ajunge direct în style string-ul de la Suno.
 *
 * A treia regulă: numără ce e pe site, nu ce e în seed. Un stil grecesc care nu
 * are rând în seed și n-are prompt E o lipsă, nu un „ok” pentru că seed-ul nu-l
 * cunoaște — altfel operatorul vede verde, comută pe Google și fiecare generare
 * cade pe un fallback generic.
 */

export type RolloutScope = 'global' | 'site';
export type RolloutGroup = 'chei' | 'audio' | 'interfete' | 'catalog' | 'comert' | 'brand';
export type RolloutStatus = 'ok' | 'missing' | 'partial' | 'info';

export interface RolloutCheckDef {
  id: string;
  title: string;
  description: string;
  group: RolloutGroup;
  scope: RolloutScope;
  /** Dacă true, „Aplică lipsurile” poate repara fără confirmări extra. */
  autoApply: boolean;
}

export interface RolloutCheckResult {
  id: string;
  title: string;
  description: string;
  group: RolloutGroup;
  scope: RolloutScope;
  autoApply: boolean;
  status: RolloutStatus;
  detail: string;
}

export const ROLLOUT_CHECKS: RolloutCheckDef[] = [
  {
    id: 'gemini-key',
    title: 'Cheie Google Gemini (Lyria)',
    description: 'GEMINI_API_KEY în Setări globale. Fără ea, motorul Google pică pe toate site-urile.',
    group: 'chei',
    scope: 'global',
    autoApply: false,
  },
  {
    id: 'google-style-prompts',
    title: 'Prompturi Google pe stiluri',
    description: 'Umple googlePrompt gol din seed, doar pe site-urile cu limba seed-ului. Textul deja salvat rămâne.',
    group: 'audio',
    scope: 'site',
    autoApply: true,
  },
  {
    id: 'google-occasion-prompts',
    title: 'Prompturi Google pe ocazii',
    description: 'La fel ca la stiluri, pe ocazii. Se aplică doar pe limbile care au seed; pe restul doar raportează lipsurile.',
    group: 'audio',
    scope: 'site',
    autoApply: true,
  },
  {
    id: 'suno-style-prompts',
    title: 'Prompturi Suno pe stiluri',
    description: 'Umple sunoPrompt gol din seed, pe stilurile care există deja și doar dacă limba site-ului are seed.',
    group: 'audio',
    scope: 'site',
    autoApply: true,
  },
  {
    id: 'suno-occasion-prompts',
    title: 'Prompturi Suno pe ocazii',
    description: 'Umple sunoPrompt gol din seed, pe ocaziile care există deja și doar dacă limba site-ului are seed.',
    group: 'audio',
    scope: 'site',
    autoApply: true,
  },
  {
    id: 'cadou-interface',
    title: 'Interfața Cadou activă',
    description: 'Asigură experienceConfig.items.cadou.enabled. Nu schimbă interfața default a site-ului.',
    group: 'interfete',
    scope: 'site',
    autoApply: true,
  },
  {
    id: 'cadou-catalog-google',
    title: 'Prompturi Google pe catalogul Cadou',
    description: 'Dacă Cadou are catalog propriu, umple googlePrompt gol pe stiluri/ocazii override (tot cu garda de limbă).',
    group: 'interfete',
    scope: 'site',
    autoApply: true,
  },
  {
    id: 'music-engine',
    title: 'Motor audio (Suno / Google)',
    description: 'Alege conștient per site. Nu se aplică automat — un switch greșit schimbă toate generările.',
    group: 'audio',
    scope: 'site',
    autoApply: false,
  },
  {
    id: 'package-prices',
    title: 'Prețuri pe pachete',
    description: 'packagePricesCents pentru Standard / Plus / Premium. Lipsa = fallback-ul din PACKAGES.',
    group: 'comert',
    scope: 'site',
    autoApply: false,
  },
  {
    id: 'social-urls',
    title: 'Linkuri Facebook și TikTok',
    description: 'Necesare pentru cardul de follow 40% de pe pagina piesei Cadou.',
    group: 'brand',
    scope: 'site',
    autoApply: false,
  },
  {
    id: 'style-samples',
    title: 'Mostre audio pe stiluri',
    description: 'Fără mostră, cardul de stil din wizard n-are preview. Se generează din Catalog, nu de aici.',
    group: 'catalog',
    scope: 'site',
    autoApply: false,
  },
];

function blank(v: unknown): boolean {
  return typeof v !== 'string' || v.trim() === '';
}

type PromptField = 'sunoPrompt' | 'googlePrompt';
type Promptable = { id: string; sunoPrompt?: string; googlePrompt?: string };

/**
 * Golurile de prompt pe o listă de stiluri / ocazii.
 *
 * `fillable` = goale ȘI acoperite de seed-ul limbii site-ului → le repară „Aplică”.
 * `manual`   = goale, dar fără rând în seed (id propriu, ex. `kyuchek`, sau site
 *              pe altă limbă) → doar operatorul le poate scrie, din Catalog.
 *
 * `manual` e exact ce se pierdea înainte: filtrul vechi cerea `seed[item.id]`,
 * deci item-ele necunoscute seed-ului deveneau invizibile și check-ul raporta „ok”.
 */
interface PromptGap {
  total: number;
  fillable: string[];
  manual: string[];
}

function gapCount(gap: PromptGap): number {
  return gap.fillable.length + gap.manual.length;
}

function analyzePrompts(
  items: Promptable[] | undefined,
  seed: CatalogPromptSeedMap | null,
  field: PromptField,
): PromptGap {
  const list = items ?? [];
  const fillable: string[] = [];
  const manual: string[] = [];
  for (const item of list) {
    if (!blank(item[field])) continue;
    if (seedRow(seed, item.id)) fillable.push(item.id);
    else manual.push(item.id);
  }
  return { total: list.length, fillable, manual };
}

/** Seed `null` (limbă fără seed) ⇒ nu se completează nimic. */
function fillPrompts<T extends Promptable>(
  items: T[],
  seed: CatalogPromptSeedMap | null,
  field: PromptField,
): { next: T[]; filled: string[] } {
  const filled: string[] = [];
  if (!seed) return { next: items, filled };
  const next = items.map((item) => {
    const row = seedRow(seed, item.id);
    if (!row) return item;
    if (!blank(item[field])) return item;
    filled.push(item.id);
    return { ...item, [field]: row[field] };
  });
  return { next, filled };
}

function listIds(ids: string[], max = 8): string {
  return ids.length <= max ? ids.join(', ') : `${ids.slice(0, max).join(', ')} +${ids.length - max}`;
}

function promptStatus(gap: PromptGap): RolloutStatus {
  if (gap.total === 0) return 'info';
  const missing = gapCount(gap);
  if (missing === 0) return 'ok';
  return missing === gap.total ? 'missing' : 'partial';
}

interface PromptDetailOpts {
  /** „stiluri” / „ocazii” — pentru text. */
  kind: string;
  /** „Suno” / „Google” — motorul căruia îi lipsește promptul. */
  engine: string;
  /** Ce scriem când site-ul n-are deloc stiluri/ocazii salvate. */
  emptyDetail: string;
  /** Limba site-ului, normalizată. */
  siteLocale: string;
  /** Există seed pentru limba site-ului? */
  seeded: boolean;
}

/** Textul din admin. Spune adevărul: câte lipsesc, câte se repară singure, câte nu. */
function promptDetail(gap: PromptGap, o: PromptDetailOpts): string {
  if (gap.total === 0) return o.emptyDetail;
  if (gapCount(gap) === 0) return `Toate cele ${gap.total} ${o.kind} au prompt ${o.engine}.`;

  const bits = [`Lipsă prompt ${o.engine} pe ${gapCount(gap)} din ${gap.total} ${o.kind}.`];
  if (gap.fillable.length > 0) {
    bits.push(`Se umplu din seed la „Aplică”: ${listIds(gap.fillable)}.`);
  }
  if (gap.manual.length > 0) {
    bits.push(
      o.seeded
        ? `${gap.manual.length} nu au rând în seed — de completat manual din Catalog: ${listIds(gap.manual)}.`
        : `Seed-ul e scris pentru ${SEEDED_LOCALES.map((l) => `„${l}”`).join(', ')}, site-ul e pe „${o.siteLocale || '?'}” — nu se aplică automat (ar injecta text în altă limbă în prompturile trimise la motor). De completat manual din Catalog: ${listIds(gap.manual)}.`,
    );
  }
  return bits.join(' ');
}

function emptyCadouItem(): SiteExperienceItemConfig {
  return { enabled: true, utmRules: [], packages: {}, catalog: {} };
}

@Injectable()
export class SiteRolloutService {
  constructor(
    private readonly sites: SitesService,
    private readonly settings: SettingsService,
  ) {}

  async overview() {
    const gemini = await this.settings.get('GEMINI_API_KEY');
    const global = this.globalChecks(gemini);
    const all = await this.sites.listAll();
    const sites = all.map((s) => this.inspectSite(s));
    return {
      checks: ROLLOUT_CHECKS,
      global,
      sites,
      totals: {
        sites: sites.length,
        sitesWithGaps: sites.filter((s) => s.missing > 0).length,
        autoFixable: sites.reduce((n, s) => n + s.autoFixable, 0),
      },
    };
  }

  async forSite(id: string) {
    const site = await this.sites.findById(id);
    if (!site) throw new NotFoundException('Site negăsit');
    const gemini = await this.settings.get('GEMINI_API_KEY');
    return {
      checks: ROLLOUT_CHECKS,
      global: this.globalChecks(gemini),
      site: this.inspectSite(site),
    };
  }

  async apply(id: string, checkIds?: string[]) {
    const site = await this.sites.findById(id);
    if (!site) throw new NotFoundException('Site negăsit');
    const wanted = this.resolveWanted(checkIds);
    const { patch, applied, skipped } = this.buildPatch(site, wanted);
    if (Object.keys(patch).length > 0) {
      await this.sites.update(id, patch);
    }
    const after = await this.sites.findById(id);
    return {
      applied,
      skipped,
      site: after ? this.inspectSite(after) : null,
    };
  }

  async applyAll(checkIds?: string[]) {
    const all = await this.sites.listAll();
    const results: Array<{ applied: string[]; skipped: string[]; site: ReturnType<SiteRolloutService['inspectSite']> | null }> = [];
    for (const s of all) {
      results.push(await this.apply(s.id, checkIds));
    }
    return { results };
  }

  private resolveWanted(checkIds?: string[]): Set<string> {
    if (checkIds && checkIds.length > 0) {
      return new Set(checkIds.filter((id) => ROLLOUT_CHECKS.some((c) => c.id === id && c.autoApply)));
    }
    return new Set(ROLLOUT_CHECKS.filter((c) => c.autoApply).map((c) => c.id));
  }

  private globalChecks(geminiKey: string): RolloutCheckResult[] {
    const def = ROLLOUT_CHECKS.find((c) => c.id === 'gemini-key')!;
    const set = !blank(geminiKey);
    return [
      {
        ...def,
        status: set ? 'ok' : 'missing',
        detail: set
          ? 'Cheia e setată (DB sau env).'
          : 'Lipsește. Pune-o în Setări → Chei → Gemini / Lyria (aistudio.google.com/apikey).',
      },
    ];
  }

  private inspectSite(site: Site) {
    const checks = this.siteChecks(site);
    const missing = checks.filter((c) => c.status === 'missing').length;
    const partial = checks.filter((c) => c.status === 'partial').length;
    const autoFixable = checks.filter((c) => c.autoApply && (c.status === 'missing' || c.status === 'partial')).length;
    return {
      id: site.id,
      name: site.name,
      domain: site.domain,
      locale: site.locale,
      currency: site.currency,
      musicEngine: site.musicEngine === 'google' ? 'google' : 'suno',
      active: site.active,
      missing,
      partial,
      autoFixable,
      checks,
    };
  }

  private siteChecks(site: Site): RolloutCheckResult[] {
    const styles = site.styles ?? [];
    const occasions = site.occasions ?? [];
    const cfg = site.experienceConfig;
    const cadou = cfg?.items?.cadou;

    // Seed-ul se potrivește pe limba site-ului. `null` = n-avem prompturi scrise
    // pentru limba asta ⇒ nimic nu e auto-reparabil aici, doar de raportat.
    const seed = seedForLocale(site.locale);
    const siteLocale = normalizeSeedLocale(site.locale);
    const seeded = seed !== null;
    const styleSeed = seed?.styles ?? null;
    const occasionSeed = seed?.occasions ?? null;

    const gStyles = analyzePrompts(styles, styleSeed, 'googlePrompt');
    const gOcc = analyzePrompts(occasions, occasionSeed, 'googlePrompt');
    const sStyles = analyzePrompts(styles, styleSeed, 'sunoPrompt');
    const sOcc = analyzePrompts(occasions, occasionSeed, 'sunoPrompt');

    const samples = site.suno?.styleSamples ?? {};
    const stylesWithoutSample = styles.filter((st) => !samples[st.id]?.audioUrl).map((st) => st.id);

    const cadouStyles = cadou?.catalog?.styles ?? [];
    const cadouOccasions = cadou?.catalog?.occasions ?? [];
    const cadouGStyles = analyzePrompts(cadouStyles, styleSeed, 'googlePrompt');
    const cadouGOcc = analyzePrompts(cadouOccasions, occasionSeed, 'googlePrompt');
    const cadouG: PromptGap = {
      total: cadouGStyles.total + cadouGOcc.total,
      fillable: [...cadouGStyles.fillable, ...cadouGOcc.fillable],
      manual: [...cadouGStyles.manual, ...cadouGOcc.manual],
    };
    const cadouHasOwnCatalog = (cadouStyles.length > 0 || cadouOccasions.length > 0);

    const engine = site.musicEngine === 'google' ? 'google' : 'suno';
    const engineGaps = engine === 'suno' ? [sStyles, sOcc] : [gStyles, gOcc];
    const engineMissing = engineGaps.reduce((n, g) => n + gapCount(g), 0);
    const engineFillable = engineGaps.reduce((n, g) => n + g.fillable.length, 0);
    const engineManual = engineGaps.reduce((n, g) => n + g.manual.length, 0);
    const engineReady = engineMissing === 0;

    const prices = site.packagePricesCents ?? {};
    const priceKeys = ['basic', 'plus', 'premium'].filter((k) => typeof (prices as Record<string, number>)[k] === 'number');

    const fb = site.social?.facebook ?? '';
    const tt = site.social?.tiktok ?? '';

    const detailOpts = (kind: string, engineLabel: string, emptyDetail: string): PromptDetailOpts => ({
      kind,
      engine: engineLabel,
      emptyDetail,
      siteLocale,
      seeded,
    });
    const noStyles = 'Niciun stil salvat — catalogul cade pe seed-ul web, dar adminul n-are ce umple până salvezi stilurile.';
    const noOccasions = 'Nicio ocazie salvată.';

    return ROLLOUT_CHECKS.filter((c) => c.scope === 'site').map((def) => {
      switch (def.id) {
        case 'google-style-prompts':
          return this.promptResult(def, gStyles, detailOpts('stiluri', 'Google', noStyles));
        case 'google-occasion-prompts':
          return this.promptResult(def, gOcc, detailOpts('ocazii', 'Google', noOccasions));
        case 'suno-style-prompts':
          return this.promptResult(def, sStyles, detailOpts('stiluri', 'Suno', noStyles));
        case 'suno-occasion-prompts':
          return this.promptResult(def, sOcc, detailOpts('ocazii', 'Suno', noOccasions));
        case 'cadou-interface': {
          if (cadou?.enabled) return this.result(def, 'ok', `Activă. Default site: ${cfg?.defaultSlug ?? 'classic'}.`);
          if (cadou && cadou.enabled === false) return this.result(def, 'partial', 'Există în config dar e oprită.');
          return this.result(def, 'missing', 'Cadou nu e în experienceConfig. Apply o activează fără să schimbe default-ul.');
        }
        case 'cadou-catalog-google': {
          if (!cadouHasOwnCatalog) {
            return this.result(def, 'ok', 'Cadou moștenește catalogul site-ului (nimic de umplut aici).', false);
          }
          return this.promptResult(
            def,
            cadouG,
            detailOpts('intrări din catalogul Cadou', 'Google', 'Catalogul Cadou e gol.'),
          );
        }
        case 'music-engine': {
          const engineName = engine === 'google' ? 'Google Lyria 3 Pro' : 'Suno';
          let detail = `Acum: ${engineName}.`;
          if (!engineReady) {
            detail += ` Prompturile motorului activ lipsesc pe ${engineMissing} intrări`;
            if (engineFillable > 0) detail += `, din care ${engineFillable} se umplu din seed`;
            if (engineManual > 0) {
              detail += `${engineFillable > 0 ? ' și' : ','} ${engineManual} trebuie scrise manual (fără ele generarea cade pe un fallback generic, nu pe sunetul site-ului)`;
            }
            detail += '.';
          }
          detail += ' Comutarea se face din Acest site → Generare.';
          return this.result(def, engineReady ? 'ok' : 'partial', detail);
        }
        case 'package-prices':
          return this.result(def, priceKeys.length === 3 ? 'ok' : priceKeys.length === 0 ? 'info' : 'partial',
            priceKeys.length === 0
              ? 'Fără override — se folosesc prețurile default din PACKAGES. Setează-le în Acest site → Prețuri dacă vrei altceva decât 29,99 / 49,99 / 69,99.'
              : priceKeys.length === 3
                ? 'Toate cele 3 pachete au preț propriu.'
                : `Setate: ${priceKeys.join(', ')}. Restul cad pe default.`);
        case 'social-urls': {
          const bits: string[] = [];
          if (blank(fb)) bits.push('Facebook');
          if (blank(tt)) bits.push('TikTok');
          return this.result(def, bits.length === 0 ? 'ok' : bits.length === 2 ? 'missing' : 'partial',
            bits.length === 0 ? 'Facebook și TikTok sunt setate.' : `Lipsește: ${bits.join(', ')}. Cardul de follow 40% are fallback hardcodat, dar linkurile de site trebuie ale tale.`);
        }
        case 'style-samples':
          return this.result(def, stylesWithoutSample.length === 0 ? 'ok' : styles.length === 0 ? 'info' : 'partial',
            styles.length === 0
              ? 'Niciun stil.'
              : stylesWithoutSample.length === 0
                ? 'Fiecare stil are mostră audio.'
                : `Fără mostră: ${stylesWithoutSample.join(', ')}. Generează-le din Catalog.`);
        default:
          return this.result(def, 'info', '');
      }
    });
  }

  /**
   * `autoApply` din rezultat e per-site, nu din definiție: un check poate fi
   * „auto” în principiu, dar pe site-ul ăsta să n-aibă ce repara (limbă fără
   * seed, id-uri necunoscute seed-ului). Adminul numără butonul „Umple golurile”
   * din el, deci nu trebuie să promită reparații pe care apply nu le poate face.
   */
  private result(def: RolloutCheckDef, status: RolloutStatus, detail: string, autoApply?: boolean): RolloutCheckResult {
    return { ...def, autoApply: autoApply ?? def.autoApply, status, detail };
  }

  private promptResult(def: RolloutCheckDef, gap: PromptGap, opts: PromptDetailOpts): RolloutCheckResult {
    return this.result(def, promptStatus(gap), promptDetail(gap, opts), def.autoApply && gap.fillable.length > 0);
  }

  private buildPatch(site: Site, wanted: Set<string>) {
    const applied: string[] = [];
    const skipped: string[] = [];
    const patch: Partial<Site> = {};
    let styles = [...(site.styles ?? [])];
    let occasions = [...(site.occasions ?? [])];
    let stylesDirty = false;
    let occasionsDirty = false;
    let experienceConfig = site.experienceConfig;

    // GARDA DE LIMBĂ. `seed` e null pentru orice site pe o limbă fără
    // prompturi scrise (limbile disponibile sunt cele din CATALOG_SEEDS —
    // vezi SEEDED_LOCALES). Atunci fillPrompts nu scrie
    // nimic, iar check-urile rămân pe missing/partial cu instrucțiuni manuale.
    // Fără asta, „Aplică pe toate site-urile” punea română pe chalgapodarok.bg.
    const seed: CatalogPromptSeedSet | null = seedForLocale(site.locale);

    const takeStyles = (id: string, field: PromptField) => {
      if (!wanted.has(id)) return;
      const { next, filled } = fillPrompts(styles, seed?.styles ?? null, field);
      if (filled.length === 0) {
        skipped.push(id);
        return;
      }
      styles = next;
      stylesDirty = true;
      applied.push(id);
    };
    const takeOccasions = (id: string, field: PromptField) => {
      if (!wanted.has(id)) return;
      const { next, filled } = fillPrompts(occasions, seed?.occasions ?? null, field);
      if (filled.length === 0) {
        skipped.push(id);
        return;
      }
      occasions = next;
      occasionsDirty = true;
      applied.push(id);
    };

    takeStyles('google-style-prompts', 'googlePrompt');
    takeStyles('suno-style-prompts', 'sunoPrompt');
    takeOccasions('google-occasion-prompts', 'googlePrompt');
    takeOccasions('suno-occasion-prompts', 'sunoPrompt');

    if (wanted.has('cadou-interface')) {
      const current = experienceConfig ?? { defaultSlug: 'classic', items: {} as SiteExperienceConfig['items'] };
      const item = current.items?.cadou;
      if (item?.enabled) {
        skipped.push('cadou-interface');
      } else {
        experienceConfig = {
          defaultSlug: current.defaultSlug || 'classic',
          items: {
            ...current.items,
            cadou: { ...(item ?? emptyCadouItem()), enabled: true },
          },
        };
        applied.push('cadou-interface');
      }
    }

    if (wanted.has('cadou-catalog-google')) {
      const cfg = experienceConfig ?? site.experienceConfig;
      const catalog: ExperienceCatalogConfig | undefined = cfg?.items?.cadou?.catalog;
      const hasOwn = (catalog?.styles?.length ?? 0) > 0 || (catalog?.occasions?.length ?? 0) > 0;
      if (!cfg || !catalog || !hasOwn || !seed) {
        skipped.push('cadou-catalog-google');
      } else {
        const st = fillPrompts(catalog.styles ?? [], seed.styles, 'googlePrompt');
        const oc = fillPrompts(catalog.occasions ?? [], seed.occasions, 'googlePrompt');
        if (st.filled.length === 0 && oc.filled.length === 0) {
          skipped.push('cadou-catalog-google');
        } else {
          experienceConfig = {
            defaultSlug: cfg.defaultSlug || 'classic',
            items: {
              ...cfg.items,
              cadou: {
                ...cfg.items.cadou,
                catalog: {
                  ...catalog,
                  styles: st.next,
                  occasions: oc.next,
                },
              },
            },
          };
          applied.push('cadou-catalog-google');
        }
      }
    }

    if (stylesDirty) patch.styles = styles;
    if (occasionsDirty) patch.occasions = occasions;
    if (experienceConfig !== site.experienceConfig) patch.experienceConfig = experienceConfig;
    return { patch, applied, skipped };
  }
}
