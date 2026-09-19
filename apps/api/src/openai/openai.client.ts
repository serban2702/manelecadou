import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { SettingsService } from '../modules/settings/settings.service';
import {
  buildChatParams,
  isReasoningModel,
  normalizeEffort,
  requiresResponsesApiForTools,
  type ReasoningEffort,
} from './openai-params.helper';

export type { ReasoningEffort } from './openai-params.helper';

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCallSummary[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ToolCallSummary {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolCallRequest {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ChatWithToolsResult {
  finalContent: string | null;
  toolCalls: Array<{ request: ToolCallRequest; result: unknown; error?: string }>;
  iterations: number;
  model: string;
  usage?: { prompt: number; completion: number };
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

@Injectable()
export class OpenAiClient {
  private readonly logger = new Logger('OpenAiClient');
  private client: OpenAI | null = null;
  private clientKey: string | null = null;

  constructor(private readonly settings: SettingsService) {}

  private async ensure(): Promise<OpenAI> {
    const key = await this.settings.get('OPENAI_API_KEY');
    if (!key) throw new Error('OPENAI_API_KEY missing');
    if (this.client && this.clientKey === key) return this.client;
    // Forțăm fetch-ul nativ (undici) în loc de node-fetch@2.7.0 pe care SDK-ul
    // openai îl folosește intern. Node 22.23+ rupe node-fetch@2 la decompresia
    // gzip a răspunsului OpenAI — aruncă "Invalid response body ... Premature
    // close" din zlib.Gunzip, ceea ce pică TOATE apelurile (chat Irina, lyrics,
    // translation, seo). Fetch-ul nativ decompresează corect. Incident 2026-06-19.
    this.client = new OpenAI({ apiKey: key, fetch: globalThis.fetch as any });
    this.clientKey = key;
    return this.client;
  }

  async json<T = unknown>(opts: {
    system: string;
    user: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ raw: string; data: T; model: string; usage?: { prompt: number; completion: number } }> {
    const autoModel = await this.settings.get('OPENAI_AUTOREPLY_MODEL');
    const defaultModel = await this.settings.get('OPENAI_MODEL');
    const model = opts.model ?? (autoModel || defaultModel || 'gpt-4o-mini');
    const client = await this.ensure();
    const res = await client.chat.completions.create(
      buildChatParams({
        model,
        temperature: opts.temperature ?? 0.2,
        maxTokens: opts.maxTokens ?? 800,
        responseFormat: { type: 'json_object' },
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
      }),
    );
    const raw = res.choices[0]?.message?.content ?? '{}';
    let data: T;
    try {
      data = JSON.parse(raw) as T;
    } catch {
      throw new Error(`OpenAI returned invalid JSON: ${raw.slice(0, 200)}`);
    }
    return {
      raw,
      data,
      model,
      usage: res.usage ? { prompt: res.usage.prompt_tokens, completion: res.usage.completion_tokens } : undefined,
    };
  }

  /**
   * Chat cu function calling. Buclează până când AI răspunde fără tool call sau
   * până atinge `maxIterations`. Tool handler-urile pot fi async — primesc args
   * parsed și întorc orice JSON-stringifiable.
   *
   * Returnează finalContent (text răspuns) + lista de tool calls cu rezultatele lor.
   */
  async chatWithTools(opts: {
    messages: ChatMessage[];
    tools: ToolDef[];
    toolHandlers: Record<string, ToolHandler>;
    model?: string;
    temperature?: number;
    maxIterations?: number;
    maxTokens?: number;
    reasoningEffort?: ReasoningEffort;
  }): Promise<ChatWithToolsResult> {
    const aiChatModel = await this.settings.get('AI_CHAT_MODEL');
    const defaultModel = await this.settings.get('OPENAI_MODEL');
    const model = opts.model ?? (aiChatModel || defaultModel || 'gpt-4o-mini');

    // gpt-5.6+ refuză function tools pe /v1/chat/completions (vezi
    // `requiresResponsesApiForTools`). Pentru ele bucla merge pe /v1/responses,
    // unde reasoning-ul real funcționează împreună cu tool-urile.
    if (opts.tools.length > 0 && requiresResponsesApiForTools(model)) {
      return this.chatWithToolsViaResponses({ ...opts, model });
    }

    const client = await this.ensure();
    const messages: ChatMessage[] = [...opts.messages];
    const toolCalls: ChatWithToolsResult['toolCalls'] = [];
    const maxIter = opts.maxIterations ?? 6;
    let totalPromptTok = 0;
    let totalCompletionTok = 0;
    let lastModel = model;

    const toolsParam = opts.tools.map((t) => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    const reasoning = isReasoningModel(model);

    for (let i = 0; i < maxIter; i++) {
      // Construim params manual: modelele reasoning (o-series, gpt-5) acceptă DOAR
      // temperature=1 (default) → orice altă valoare întoarce 400 și pică tot
      // chat-ul. Pentru ele omitem temperature și trimitem reasoning_effort.
      const params: Record<string, unknown> = {
        model,
        messages,
        tools: toolsParam,
        tool_choice: 'auto',
      };
      if (opts.maxTokens !== undefined) params.max_completion_tokens = opts.maxTokens;
      if (reasoning) {
        // gpt-5/o-series rulează reasoning intern (default medium) — ăsta e
        // câștigul față de gpt-4o-mini. ATENȚIE: `reasoning_effort` explicit NU e
        // acceptat pe /v1/chat/completions ÎMPREUNĂ cu function tools (API → 400
        // „use /v1/responses instead"). Deci îl trimitem doar când NU avem tools;
        // cu tools modelul folosește effort-ul default.
        if (opts.reasoningEffort && toolsParam.length === 0) {
          params.reasoning_effort = opts.reasoningEffort;
        }
      } else if (opts.temperature !== undefined) {
        params.temperature = opts.temperature;
      }
      const res = await client.chat.completions.create(
        params as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
      );
      if (res.usage) {
        totalPromptTok += res.usage.prompt_tokens;
        totalCompletionTok += res.usage.completion_tokens;
      }
      lastModel = res.model ?? model;

      const choice = res.choices[0];
      const assistantMsg = choice?.message;
      if (!assistantMsg) {
        return {
          finalContent: null,
          toolCalls,
          iterations: i + 1,
          model: lastModel,
          usage: { prompt: totalPromptTok, completion: totalCompletionTok },
        };
      }

      const requestedCalls = (assistantMsg.tool_calls ?? []) as ToolCallSummary[];

      // Push assistant message indiferent dacă are sau nu tool calls
      messages.push({
        role: 'assistant',
        content: assistantMsg.content ?? null,
        tool_calls: requestedCalls.length > 0 ? requestedCalls : undefined,
      });

      if (requestedCalls.length === 0) {
        // AI a răspuns final — fără tool call.
        return {
          finalContent: assistantMsg.content ?? null,
          toolCalls,
          iterations: i + 1,
          model: lastModel,
          usage: { prompt: totalPromptTok, completion: totalCompletionTok },
        };
      }

      // Execută SECVENȚIAL (nu paralel) — dacă AI cere 2 tool calls identice
      // în același iter, al doilea vede state-ul actualizat de primul (ex.
      // ctx.suggestionMsgId setat → blochează duplicate). Plus assertNotManual
      // în fiecare handler vede mode-ul actual ÎNAINTE de a doua execuție.
      const results: Array<{ tc: ToolCallSummary; output: unknown; error: string | undefined }> = [];
      for (const tc of requestedCalls) {
        const name = tc.function.name;
        const handler = opts.toolHandlers[name];
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          results.push({ tc, output: null, error: `invalid args JSON: ${tc.function.arguments}` });
          continue;
        }
        if (!handler) {
          results.push({ tc, output: null, error: `unknown tool: ${name}` });
          continue;
        }
        try {
          const output = await handler(parsedArgs);
          results.push({ tc, output, error: undefined });
        } catch (e) {
          results.push({ tc, output: null, error: (e as Error).message });
        }
      }

      // Push tool messages cu rezultate + audit
      for (const r of results) {
        const content = r.error
          ? JSON.stringify({ error: r.error })
          : JSON.stringify(r.output ?? null);
        messages.push({ role: 'tool', tool_call_id: r.tc.id, content });
        toolCalls.push({
          request: {
            id: r.tc.id,
            name: r.tc.function.name,
            args: r.tc.function.arguments ? safeParse(r.tc.function.arguments) : {},
          },
          result: r.output,
          error: r.error,
        });
      }
      // continuă bucla → AI primește rezultatele tool-urilor și răspunde
    }

    return {
      finalContent: null,
      toolCalls,
      iterations: maxIter,
      model: lastModel,
      usage: { prompt: totalPromptTok, completion: totalCompletionTok },
    };
  }

  /**
   * Aceeași buclă de tool calling, dar peste `/v1/responses`.
   *
   * Necesară pentru `gpt-5.6+`, care întoarce 400 la orice cerere cu `tools` pe
   * `/v1/chat/completions`. Diferențe față de calea clasică, toate obligatorii:
   *  - mesajele devin `input items`; rezultatul unui tool e un item separat
   *    `function_call_output` legat prin `call_id` (nu `role: 'tool'`);
   *  - itemele de `reasoning` întoarse de model trebuie trimise ÎNAPOI la runda
   *    următoare, altfel modelul pierde firul între tool call și răspuns;
   *  - `max_output_tokens` în loc de `max_completion_tokens`;
   *  - `temperature` nu e acceptată deloc (modelele astea rulează pe default).
   *
   * `store: false` — păstrăm comportamentul de pe chat/completions: conversațiile
   * clienților nu rămân stocate la OpenAI.
   */
  private async chatWithToolsViaResponses(opts: {
    messages: ChatMessage[];
    tools: ToolDef[];
    toolHandlers: Record<string, ToolHandler>;
    model: string;
    maxIterations?: number;
    maxTokens?: number;
    reasoningEffort?: ReasoningEffort;
  }): Promise<ChatWithToolsResult> {
    const client = await this.ensure();
    const model = opts.model;
    const maxIter = opts.maxIterations ?? 6;
    const toolCalls: ChatWithToolsResult['toolCalls'] = [];
    let totalIn = 0;
    let totalOut = 0;
    let lastModel = model;

    // La intrare mesajele sunt doar system/user/assistant text (bucla își
    // construiește singură itemele de tool), deci conversia e directă.
    const input: Array<Record<string, unknown>> = opts.messages.map((m) => ({
      role: m.role === 'tool' ? 'user' : m.role,
      content: typeof m.content === 'string' ? m.content : '',
    }));

    const tools = opts.tools.map((t) => ({
      type: 'function' as const,
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    const effort = normalizeEffort(opts.reasoningEffort ?? 'medium', model);

    for (let i = 0; i < maxIter; i++) {
      const params: Record<string, unknown> = {
        model,
        input,
        tools,
        tool_choice: 'auto',
        reasoning: { effort },
        store: false,
      };
      if (opts.maxTokens !== undefined) params.max_output_tokens = opts.maxTokens;

      const res = (await (client as unknown as {
        responses: { create: (p: unknown) => Promise<ResponsesResult> };
      }).responses.create(params)) as ResponsesResult;

      if (res.usage) {
        totalIn += res.usage.input_tokens ?? 0;
        totalOut += res.usage.output_tokens ?? 0;
      }
      lastModel = res.model ?? model;

      const output = res.output ?? [];
      // Tot ce a produs modelul (inclusiv reasoning) se întoarce în input.
      for (const item of output) input.push(item as unknown as Record<string, unknown>);

      const calls = output.filter((o) => o.type === 'function_call');
      if (calls.length === 0) {
        return {
          finalContent: extractOutputText(res),
          toolCalls,
          iterations: i + 1,
          model: lastModel,
          usage: { prompt: totalIn, completion: totalOut },
        };
      }

      // SECVENȚIAL, din același motiv ca pe calea clasică: al doilea handler
      // trebuie să vadă state-ul scris de primul.
      for (const call of calls) {
        const name = call.name ?? '';
        const rawArgs = call.arguments ?? '';
        const handler = opts.toolHandlers[name];
        let output_: unknown = null;
        let error: string | undefined;
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
        } catch {
          error = `invalid args JSON: ${rawArgs}`;
        }
        if (!error && !handler) error = `unknown tool: ${name}`;
        if (!error && handler) {
          try {
            output_ = await handler(parsedArgs);
          } catch (e) {
            error = (e as Error).message;
          }
        }
        input.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: error ? JSON.stringify({ error }) : JSON.stringify(output_ ?? null),
        });
        toolCalls.push({
          request: { id: call.call_id ?? '', name, args: safeParse(rawArgs) },
          result: output_,
          error,
        });
      }
    }

    return {
      finalContent: null,
      toolCalls,
      iterations: maxIter,
      model: lastModel,
      usage: { prompt: totalIn, completion: totalOut },
    };
  }
}

/** Forma (parțială) a răspunsului `/v1/responses` de care avem nevoie. */
interface ResponsesResult {
  model?: string;
  status?: string;
  output?: Array<{
    type: string;
    name?: string;
    arguments?: string;
    call_id?: string;
    content?: Array<{ type: string; text?: string }>;
  }>;
  output_text?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Textul final al unui răspuns `/v1/responses` (itemele `message`). */
function extractOutputText(res: ResponsesResult): string | null {
  if (typeof res.output_text === 'string' && res.output_text.trim()) return res.output_text;
  const parts: string[] = [];
  for (const item of res.output ?? []) {
    if (item.type !== 'message') continue;
    for (const c of item.content ?? []) {
      if (c.type === 'output_text' && c.text) parts.push(c.text);
    }
  }
  const joined = parts.join('\n').trim();
  return joined || null;
}

function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
