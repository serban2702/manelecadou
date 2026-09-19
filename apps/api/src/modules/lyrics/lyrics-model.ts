/**
 * Modelul OpenAI folosit la versuri — rezolvare per site + construirea cererii.
 *
 * Fișier PUR (fără NestJS), ca regulile să fie testabile:
 *  - „gol = comportamentul de azi”: fără configurare pe site, writer-ul și
 *    criticul merg exact ca înainte — `OPENAI_MODEL` din setări, pe
 *    `/v1/chat/completions`, cu `temperature` 0.85 (omisă pe reasoning);
 *  - cu configurare, cererea merge pe `/v1/responses`, singurul loc unde
 *    există `text.verbosity` și `reasoning.summary` (CLAUDE.md §12 pct. 45);
 *  - effort-ul se traduce per model prin `normalizeEffort` — o valoare
 *    inexistentă pe modelul apelat e un 400 și versuri nescrise.
 */
import type { SiteLyricsModelConfig, SiteSuno } from '../sites/site.entity';
import {
  buildChatParams,
  modelCapabilities,
  normalizeEffort,
} from '../../openai/openai-params.helper';

export type LyricsStage = 'writer' | 'critic';

/** Cheile de configurare care schimbă efectiv cererea. `model` singur nu contează aici. */
const TUNING_KEYS: Array<keyof SiteLyricsModelConfig> = [
  'effort',
  'reasoningMode',
  'verbosity',
  'textFormat',
  'reasoningSummary',
  'store',
  'temperature',
];

function clean(cfg: SiteLyricsModelConfig | null | undefined): SiteLyricsModelConfig | undefined {
  if (!cfg || typeof cfg !== 'object') return undefined;
  const out: SiteLyricsModelConfig = {};
  const model = typeof cfg.model === 'string' ? cfg.model.trim() : '';
  if (model) out.model = model;
  const effort = typeof cfg.effort === 'string' ? cfg.effort.trim().toLowerCase() : '';
  if (effort) out.effort = effort;
  if (cfg.reasoningMode === 'standard' || cfg.reasoningMode === 'pro') out.reasoningMode = cfg.reasoningMode;
  if (cfg.verbosity === 'low' || cfg.verbosity === 'medium' || cfg.verbosity === 'high') out.verbosity = cfg.verbosity;
  if (cfg.textFormat === 'text' || cfg.textFormat === 'json_object') out.textFormat = cfg.textFormat;
  if (
    cfg.reasoningSummary === 'off' ||
    cfg.reasoningSummary === 'auto' ||
    cfg.reasoningSummary === 'concise' ||
    cfg.reasoningSummary === 'detailed'
  ) {
    out.reasoningSummary = cfg.reasoningSummary;
  }
  if (typeof cfg.store === 'boolean') out.store = cfg.store;
  if (typeof cfg.temperature === 'number' && Number.isFinite(cfg.temperature)) {
    out.temperature = Math.min(2, Math.max(0, cfg.temperature));
  }
  return Object.keys(out).length ? out : undefined;
}

/** Există măcar o setare care schimbă cererea (nu doar modelul)? */
export function hasTuning(cfg: SiteLyricsModelConfig | undefined): boolean {
  if (!cfg) return false;
  return TUNING_KEYS.some((k) => cfg[k] !== undefined && cfg[k] !== null && cfg[k] !== '');
}

/**
 * Setările writer/critic ale unui site, normalizate. `criticSameAsWriter`
 * copiază writer-ul peste critic. Întoarce `undefined` pe ambele pentru un site
 * neconfigurat — exact starea tuturor site-urilor de dinainte de această versiune.
 */
export function resolveSiteLyricsModels(
  suno: Pick<SiteSuno, 'writerModel' | 'criticModel' | 'criticSameAsWriter'> | null | undefined,
): { writerModel?: SiteLyricsModelConfig; criticModel?: SiteLyricsModelConfig } {
  const writer = clean(suno?.writerModel);
  const critic = suno?.criticSameAsWriter ? writer : clean(suno?.criticModel);
  return { writerModel: writer, criticModel: critic };
}

/**
 * Câmpurile de pus pe `LyricsInput` din configul unui site. Toate call-site-urile
 * care apelează writer/critic trec prin asta, ca un site configurat să se
 * comporte la fel din wizard, din chat, din playground și din admin.
 */
export function lyricsModelInputs(
  suno: Pick<SiteSuno, 'writerModel' | 'criticModel' | 'criticSameAsWriter'> | null | undefined,
): { writerModel?: SiteLyricsModelConfig; criticModel?: SiteLyricsModelConfig } {
  return resolveSiteLyricsModels(suno);
}

export interface LyricsRequestInput {
  stage: LyricsStage;
  /** Configul pasului (deja rezolvat pe site) — `undefined` = comportamentul vechi. */
  config?: SiteLyricsModelConfig;
  /** Override explicit de model (playground / DTO). Câștigă în fața configului. */
  modelOverride?: string;
  /** Override explicit de temperatură (playground). Câștigă în fața configului. */
  temperatureOverride?: number;
  /** `OPENAI_MODEL` din setări (sau fallback-ul lui). */
  globalModel: string;
  system: string;
  user: string;
}

export interface LyricsRequest {
  endpoint: 'chat' | 'responses';
  url: string;
  model: string;
  body: Record<string, unknown>;
  /** Cum a fost aleasă calea — util în loguri. */
  reason: string;
}

const LEGACY_TEMPERATURE = 0.85;

function clampTemp(n: number | undefined): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return LEGACY_TEMPERATURE;
  return Math.min(2, Math.max(0, n));
}

/**
 * Cererea efectivă către OpenAI pentru un pas de versuri.
 *
 * Fără config (sau doar cu `model`): calea veche, `/v1/chat/completions`,
 * identică bit cu bit cu ce trimitea codul de dinainte. Cu orice setare de
 * reglaj: `/v1/responses`, cu vocabularul de acolo (`input`, `reasoning`,
 * `text`, `store`). Temperatura pleacă doar pe modelele care o acceptă.
 */
export function buildLyricsRequest(i: LyricsRequestInput): LyricsRequest {
  const cfg = clean(i.config);
  const model = i.modelOverride?.trim() || cfg?.model || i.globalModel;
  const caps = modelCapabilities(model);
  const tuned = hasTuning(cfg);

  if (!tuned) {
    const body = buildChatParams({
      model,
      temperature: clampTemp(i.temperatureOverride),
      messages: [
        { role: 'system', content: i.system },
        { role: 'user', content: i.user },
      ],
    });
    return {
      endpoint: 'chat',
      url: 'https://api.openai.com/v1/chat/completions',
      model,
      body: body as unknown as Record<string, unknown>,
      reason: cfg?.model ? 'site model, no tuning' : 'no site config',
    };
  }

  const body: Record<string, unknown> = {
    model,
    input: [
      { role: 'system', content: i.system },
      { role: 'user', content: i.user },
    ],
    // Implicit OFF: payload-ul conține nume de persoane reale.
    store: cfg?.store === true,
  };

  if (caps.reasoning) {
    const reasoning: Record<string, unknown> = {};
    if (cfg?.effort) reasoning.effort = normalizeEffort(cfg.effort, model);
    // `reasoning.mode` e un parametru SEPARAT de effort (verificat 19 sept 2026):
    // `pro` e acceptat doar pe 5.6+/6, iar `standard` e implicitul — nu-l trimitem.
    if (caps.proMode && cfg?.reasoningMode === 'pro') reasoning.mode = 'pro';
    if (caps.summary && cfg?.reasoningSummary && cfg.reasoningSummary !== 'off') {
      reasoning.summary = cfg.reasoningSummary;
    }
    if (Object.keys(reasoning).length) body.reasoning = reasoning;
  }

  const text: Record<string, unknown> = {};
  if (caps.verbosity && cfg?.verbosity) text.verbosity = cfg.verbosity;
  if (cfg?.textFormat && cfg.textFormat !== 'text') text.format = { type: cfg.textFormat };
  if (Object.keys(text).length) body.text = text;

  if (caps.temperature) {
    const t = i.temperatureOverride ?? cfg?.temperature;
    if (typeof t === 'number' && Number.isFinite(t)) body.temperature = Math.min(2, Math.max(0, t));
  }

  return {
    endpoint: 'responses',
    url: 'https://api.openai.com/v1/responses',
    model,
    body,
    reason: 'site tuning',
  };
}

/** Forma (parțială) a răspunsului `/v1/responses` de care avem nevoie aici. */
export interface ResponsesJson {
  model?: string;
  status?: string;
  output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
  output_text?: string;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  error?: { message?: string } | null;
}

/** Textul final al unui răspuns `/v1/responses` (itemele `message`). */
export function extractResponsesText(res: ResponsesJson): string {
  if (typeof res.output_text === 'string' && res.output_text.trim()) return res.output_text.trim();
  const parts: string[] = [];
  for (const item of res.output ?? []) {
    if (item.type !== 'message') continue;
    for (const c of item.content ?? []) {
      if (c.type === 'output_text' && c.text) parts.push(c.text);
    }
  }
  return parts.join('\n').trim();
}
