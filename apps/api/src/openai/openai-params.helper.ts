/**
 * Adaptează parametrii cererii Chat Completions pentru modelele noi OpenAI.
 *
 * - Toate modelele acceptă acum `max_completion_tokens` (înlocuitor pentru
 *   `max_tokens`, care e respins pe o-series și gpt-5).
 * - Modelele "reasoning" (o-series, gpt-5) acceptă doar `temperature: 1`
 *   (default), așa că pentru ele omitem complet câmpul.
 */
export function isReasoningModel(model: string): boolean {
  const m = model.trim().toLowerCase();
  return /^o[1-9]/.test(m) || m.startsWith('gpt-5') || m.startsWith('gpt-6');
}

/**
 * Versiunea minoră a unui model `gpt-5.X…` (`gpt-5.6-luna` → 6). `gpt-5` fără
 * minor → 0. Orice altceva → null.
 */
export function gpt5Minor(model: string): number | null {
  const m = /^gpt-5(?:\.(\d+))?\b/.exec(model.trim().toLowerCase());
  if (!m) return null;
  return m[1] ? parseInt(m[1], 10) : 0;
}

/** Generația majoră: 4 (4o/4.1), 5 (gpt-5.x), 6 (gpt-6-*), sau null pentru o-series/necunoscut. */
export function gptMajor(model: string): number | null {
  const m = /^gpt-(\d+)\b/.exec(model.trim().toLowerCase());
  return m ? parseInt(m[1], 10) : null;
}

/**
 * `true` pentru modelele care REFUZĂ function tools pe `/v1/chat/completions`.
 *
 * De la `gpt-5.6` (luna / sol / terra) încolo, orice cerere cu `tools` pe
 * chat/completions întoarce 400: „Function tools with reasoning_effort are not
 * supported … use /v1/responses or set reasoning_effort to 'none'". Verificat
 * empiric pe 13 septembrie 2026, pe toate valorile de effort: singura variantă
 * care trece pe chat/completions e `reasoning_effort: 'none'` — adică ZERO
 * reasoning, exact ce cumperi când iei un model de reasoning.
 *
 * Deci pentru ele mutăm bucla de tool calling pe `/v1/responses`, unde effort-ul
 * real (low/medium/high/xhigh) funcționează cu tools. `gpt-5.5` și mai vechi
 * rămân pe chat/completions — merg acolo fără probleme și nu are rost să le
 * schimbăm calea testată.
 */
export function requiresResponsesApiForTools(model: string): boolean {
  const minor = gpt5Minor(model);
  if (minor !== null && minor >= 6) return true;
  const major = gptMajor(model);
  return major !== null && major >= 6;
}

/**
 * Valorile de `reasoning.effort` acceptate de API. `minimal` există doar pe
 * modelele vechi (o-series, gpt-5.0–5.5); de la `gpt-5.6` echivalentul se
 * numește `none`, iar în plus apare `xhigh`. Normalizarea per model se face în
 * `normalizeEffort`.
 */
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

/**
 * Ce acceptă un model, ca UI-ul să ASCUNDĂ câmpurile neaplicabile, nu doar să
 * le ignore la trimitere — altfel operatorul setează o temperatură care nu face
 * nimic. O singură sursă de adevăr pentru admin (`/site` → Generare) și
 * `/site/playground`, servită prin `GET /admin/playground/meta`.
 *
 * Tot ce e mai jos a fost verificat EMPIRIC pe `/v1/responses`, pe 19 sept
 * 2026, cu un apel real per model × valoare (`scratchpad/probe-openai.mjs`):
 * mesajul de eroare al API-ului listează valorile suportate de modelul apelat,
 * deci tabelul e al lor, nu dedus din UI-ul OpenAI. Rezultatele:
 *
 *   model            effort                              temp  verbosity summary mode:pro
 *   gpt-6-astra      low,medium,high,xhigh,max           ✗     ✓         ✓       ✓
 *   gpt-5.6-*        none,low,medium,high,xhigh,max      ✗     ✓         ✓       ✓
 *   gpt-5.4 / 5.5    none,low,medium,high,xhigh          5.4:✓ ✓         ✓       ✗
 *   gpt-5 / 5-mini   minimal,low,medium,high             ✗     ✓         ✓       ✗
 *   gpt-4.1 / 4o     —                                   ✓     ✗(*)      ✗       ✗
 *
 * (*) pe gpt-4.1 `text.verbosity` acceptă DOAR `medium` (adică nimic de reglat).
 * `reasoning.mode: 'standard'` e acceptat pe orice gpt-5.x/6 și nu schimbă
 * nimic; `pro` e refuzat sub 5.6. Effort-ul NU își schimbă vocabularul în mod
 * pro — `standard`/`pro` sunt respinse ca valori de effort pe TOATE modelele.
 */
export interface ModelCapabilities {
  /** Model de raționament (reasoning.effort acceptat). */
  reasoning: boolean;
  /** Valorile de effort acceptate de API, în ordinea „cât mai puțin → cât mai mult". */
  efforts: string[];
  /** `temperature` e acceptată (4.x și, verificat, familia 5.4). */
  temperature: boolean;
  /** `text.verbosity` are valori de reglat (gpt-5+). */
  verbosity: boolean;
  /** `reasoning.summary` e acceptat (gpt-5+). */
  summary: boolean;
  /** Modelul acceptă `reasoning.mode: 'pro'` (gpt-5.6+ și gpt-6). */
  proMode: boolean;
  /** Tool calling merge doar pe `/v1/responses` (gpt-5.6+). */
  responsesOnlyForTools: boolean;
}

export function modelCapabilities(model: string): ModelCapabilities {
  const m = model.trim().toLowerCase();
  const reasoning = isReasoningModel(m);
  const minor = gpt5Minor(m);
  const major = gptMajor(m);
  const gen6 = major !== null && major >= 6;
  const gen56 = minor !== null && minor >= 6;
  const gen54 = minor !== null && minor >= 4 && minor < 6;
  let efforts: string[] = [];
  if (gen6) efforts = ['low', 'medium', 'high', 'xhigh', 'max'];
  else if (gen56) efforts = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
  else if (gen54) efforts = ['none', 'low', 'medium', 'high', 'xhigh'];
  else if (minor !== null) efforts = ['minimal', 'low', 'medium', 'high'];
  else if (reasoning) efforts = ['low', 'medium', 'high'];
  const gpt5plus = minor !== null || gen6;
  return {
    reasoning,
    efforts,
    temperature: !reasoning || minor === 4,
    verbosity: gpt5plus,
    summary: gpt5plus,
    proMode: gen56 || gen6,
    responsesOnlyForTools: requiresResponsesApiForTools(m),
  };
}

/**
 * Aceeași intenție, alt vocabular per generație de model: „cât mai puțin
 * reasoning" e `minimal` pe gpt-5.0–5.3, `none` de la 5.4 și nu există deloc pe
 * gpt-6 (minimul e `low`); `xhigh` apare de la 5.4, `max` de la 5.6. O valoare
 * inexistentă pe modelul apelat întoarce 400 și pică tot chatul (sau versurile),
 * deci traducem la cea mai apropiată valoare acceptată, în loc să presupunem.
 * `standard`/`pro` NU sunt valori de effort pe niciun model (ele țin de
 * `reasoning.mode`) — le traducem în `medium`, respectiv maximul modelului.
 */
export function normalizeEffort(effort: string, model: string): string {
  const { efforts } = modelCapabilities(model);
  if (efforts.length === 0) return effort;
  const e = effort.trim().toLowerCase();
  if (efforts.includes(e)) return e;
  const top = efforts[efforts.length - 1];
  const bottom = efforts[0];
  switch (e) {
    case 'standard':
      return 'medium';
    case 'pro':
    case 'max':
    case 'xhigh':
      // cea mai mare valoare disponibilă sub cea cerută
      return efforts.includes('xhigh') ? 'xhigh' : efforts.includes('high') ? 'high' : top;
    case 'none':
    case 'minimal':
      return bottom;
    default:
      return efforts.includes('medium') ? 'medium' : bottom;
  }
}

interface ChatParamsInput {
  model: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: 'json_object' | 'text' };
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}

interface ChatParamsOutput {
  model: string;
  messages: ChatParamsInput['messages'];
  max_completion_tokens?: number;
  temperature?: number;
  response_format?: { type: 'json_object' | 'text' };
}

export function buildChatParams(input: ChatParamsInput): ChatParamsOutput {
  const reasoning = isReasoningModel(input.model);
  const out: ChatParamsOutput = {
    model: input.model,
    messages: input.messages,
  };
  if (input.maxTokens !== undefined) {
    out.max_completion_tokens = input.maxTokens;
  }
  if (!reasoning && input.temperature !== undefined) {
    out.temperature = input.temperature;
  }
  if (input.responseFormat) {
    out.response_format = input.responseFormat;
  }
  return out;
}
