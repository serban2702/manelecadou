import { http } from '../http/client';
import type { AdminChatConversation, AdminChatMessage } from '../types';

export class ChatApi {
  static list(): Promise<AdminChatConversation[]> {
    return http.get('/admin/chat/conversations');
  }
  static thread(id: string): Promise<{ conversation: AdminChatConversation; messages: AdminChatMessage[] }> {
    return http.get(`/admin/chat/conversations/${id}`);
  }
  static reply(id: string, body: string): Promise<AdminChatMessage> {
    return http.post(`/admin/chat/conversations/${id}/messages`, { body });
  }
}
