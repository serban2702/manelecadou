import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { SettingsService } from '../modules/settings/settings.service';
import { buildChatParams } from './openai-params.helper';

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
}
