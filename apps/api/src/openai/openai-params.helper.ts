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
