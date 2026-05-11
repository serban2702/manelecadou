import { http } from '../http/client';

export type AssistantOp = 'reply' | 'reformulate' | 'fix-grammar' | 'shorten' | 'expand';
export type AssistantContextKind = 'mail' | 'chat';

export interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantResult {
  reply: string;
  suggestedDraftRo: string;
  suggestedDraftTarget: string;
  targetLang: string;
  usedKb: Array<{ id: string; title: string }>;
  translationConsensus: number;
}

export class AiAssistantApi {
  static chat(body: {
    context: { kind: AssistantContextKind; refId: string; forceTargetLang?: string };
    history: AssistantTurn[];
    message: string;
    op?: AssistantOp;
  }): Promise<AssistantResult> {
    // Multi-agent OpenAI calls — generos pe timeout (poate dura 20-40s la verifier).
    return http.post('/admin/ai-assistant/chat', body, { timeout: 90_000 });
  }
}
