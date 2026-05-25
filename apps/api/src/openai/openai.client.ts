import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { SettingsService } from '../modules/settings/settings.service';
import { buildChatParams } from './openai-params.helper';

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
    this.client = new OpenAI({ apiKey: key });
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
  }): Promise<ChatWithToolsResult> {
    const aiChatModel = await this.settings.get('AI_CHAT_MODEL');
    const defaultModel = await this.settings.get('OPENAI_MODEL');
    const model = opts.model ?? (aiChatModel || defaultModel || 'gpt-4o-mini');
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

    for (let i = 0; i < maxIter; i++) {
      const res = await client.chat.completions.create({
        model,
        messages: messages as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        tools: toolsParam,
        tool_choice: 'auto',
        // Reasoning models ignoră temperature non-default.
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(opts.maxTokens !== undefined ? { max_completion_tokens: opts.maxTokens } : {}),
      });
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

      // Execută fiecare tool call în paralel
      const results = await Promise.all(
        requestedCalls.map(async (tc) => {
          const name = tc.function.name;
          const handler = opts.toolHandlers[name];
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
          } catch {
            return { tc, output: null, error: `invalid args JSON: ${tc.function.arguments}` };
          }
          if (!handler) {
            return { tc, output: null, error: `unknown tool: ${name}` };
          }
          try {
            const output = await handler(parsedArgs);
            return { tc, output, error: undefined };
          } catch (e) {
            return { tc, output: null, error: (e as Error).message };
          }
        }),
      );

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
}

function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
