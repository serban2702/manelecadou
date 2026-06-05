import { http } from '../http/client';

export type AiMemoryKind = 'fact' | 'faq' | 'tone_example' | 'edge_case' | 'product' | 'policy';

export interface AiMemory {
  id: string;
  siteId: string | null;
  kind: AiMemoryKind;
  content: string;
  sourceConversationId: string | null;
  approved: boolean;
  usageCount: number;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiToolCallAudit {
  id: string;
  siteId: string | null;
  conversationId: string;
  triggerMessageId: string | null;
  toolName: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  aiMode: 'manual' | 'suggest' | 'auto';
  model: string | null;
  totalPromptTokens: number | null;
  totalCompletionTokens: number | null;
  requiredApproval: boolean;
  approvedBy: string | null;
  createdAt: string;
}

export interface MemoryStats {
  total: number;
  approved: number;
  pending: number;
}

export interface CostSummaryRow {
  model: string;
  calls: number;
  tokensIn: number;
  tokensOut: number;
}

export type ReviewRating = 'good' | 'bad' | 'needs_work';
export type ReviewCategory =
  | 'price' | 'tone' | 'package' | 'flow' | 'accuracy' | 'escalation' | 'other';

export interface ConversationReview {
  id: string;
  siteId: string | null;
  conversationId: string;
  rating: ReviewRating;
  category: ReviewCategory;
  comment: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  createdBy: string | null;
  createdByEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export class AiChatApi {
  static memoryList(approved?: boolean): Promise<AiMemory[]> {
    const qs = approved === undefined ? '' : `?approved=${approved ? 'true' : 'false'}`;
    return http.get(`/admin/ai-chat/memory${qs}`);
  }
  static memoryStats(): Promise<MemoryStats> {
    return http.get('/admin/ai-chat/memory/stats');
  }
  static memoryCreate(data: { kind: AiMemoryKind; content: string; approved?: boolean }): Promise<AiMemory> {
    return http.post('/admin/ai-chat/memory', data);
  }
  static memoryUpdate(id: string, data: Partial<{ kind: AiMemoryKind; content: string; approved: boolean }>): Promise<AiMemory> {
    return http.put(`/admin/ai-chat/memory/${id}`, data);
  }
  static memoryDelete(id: string): Promise<{ ok: true }> {
    return http.delete(`/admin/ai-chat/memory/${id}`);
  }
  static extractNow(): Promise<{ scannedConversations: number; newMemories: number }> {
    return http.post('/admin/ai-chat/memory/extract-now', {});
  }
  static auditList(opts: { conversationId?: string; toolName?: string; limit?: number } = {}): Promise<AiToolCallAudit[]> {
    const params = new URLSearchParams();
    if (opts.conversationId) params.set('conversationId', opts.conversationId);
    if (opts.toolName) params.set('toolName', opts.toolName);
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return http.get(`/admin/ai-chat/audit${qs ? `?${qs}` : ''}`);
  }
  static costSummary(): Promise<CostSummaryRow[]> {
    return http.get('/admin/ai-chat/audit/cost-summary');
  }

  // ===== Conversation reviews =====
  static reviewList(opts: { conversationId?: string; resolved?: boolean; limit?: number } = {}): Promise<ConversationReview[]> {
    const params = new URLSearchParams();
    if (opts.conversationId) params.set('conversationId', opts.conversationId);
    if (opts.resolved !== undefined) params.set('resolved', opts.resolved ? 'true' : 'false');
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return http.get(`/admin/ai-chat/reviews${qs ? `?${qs}` : ''}`);
  }
  static reviewStats(): Promise<{ total: number; pending: number }> {
    return http.get('/admin/ai-chat/reviews/stats');
  }
  static reviewCreate(data: { conversationId: string; rating: ReviewRating; category?: ReviewCategory; comment?: string }): Promise<ConversationReview> {
    return http.post('/admin/ai-chat/reviews', data);
  }
  static reviewUpdate(id: string, data: Partial<{ rating: ReviewRating; category: ReviewCategory; comment: string; resolved: boolean }>): Promise<ConversationReview> {
    return http.put(`/admin/ai-chat/reviews/${id}`, data);
  }
  static reviewDelete(id: string): Promise<{ ok: true }> {
    return http.delete(`/admin/ai-chat/reviews/${id}`);
  }
}
