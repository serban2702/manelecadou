import { http } from '../http/client';
import type { AdminChatConversation, AdminChatMessage } from '../types';

export class ChatApi {
  static list(opts: { q?: string } = {}): Promise<AdminChatConversation[]> {
    const params = new URLSearchParams();
    if (opts.q) params.set('q', opts.q);
    const qs = params.toString();
    return http.get(`/admin/chat/conversations${qs ? `?${qs}` : ''}`);
  }
  static thread(id: string): Promise<{ conversation: AdminChatConversation; messages: AdminChatMessage[] }> {
    return http.get(`/admin/chat/conversations/${id}`);
  }
  static reply(id: string, body: string): Promise<AdminChatMessage> {
    return http.post(`/admin/chat/conversations/${id}/messages`, { body });
  }
}
