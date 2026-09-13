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
  return /^o[1-9]/.test(m) || m.startsWith('gpt-5');
}

/**
 * Versiunea minoră a unui model `gpt-5.X…` (`gpt-5.6-luna` → 6). `gpt-5` fără
 * minor → 0. Orice altceva → null.
 */
function gpt5Minor(model: string): number | null {
  const m = /^gpt-5(?:\.(\d+))?\b/.exec(model.trim().toLowerCase());
  if (!m) return null;
  return m[1] ? parseInt(m[1], 10) : 0;
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
  return minor !== null && minor >= 6;
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
