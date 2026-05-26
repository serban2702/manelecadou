import { http } from '../http/client';
import type { AdminChatConversation, AdminChatMessage, AiChatMode } from '../types';

export interface QuickReply {
  id: string;
  siteId: string | null;
  label: string;
  text: string;
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentLinkOpts {
  amount?: number;
  currency?: string;
  description?: string;
  premium?: boolean;
}

export class ChatApi {
  static list(opts: { q?: string; archived?: boolean } = {}): Promise<AdminChatConversation[]> {
    const params = new URLSearchParams();
    if (opts.q) params.set('q', opts.q);
    if (opts.archived) params.set('archived', 'true');
    const qs = params.toString();
    return http.get(`/admin/chat/conversations${qs ? `?${qs}` : ''}`);
  }
  static archive(id: string, archived: boolean): Promise<{ ok: true; archivedAt: string | null }> {
    return http.patch(`/admin/chat/conversations/${id}/archive`, { archived });
  }
  static rename(id: string, subject: string): Promise<{ ok: true; subject: string }> {
    return http.patch(`/admin/chat/conversations/${id}/rename`, { subject });
  }
  static deleteConversation(id: string): Promise<{ ok: true; deletedMessages: number }> {
    return http.delete(`/admin/chat/conversations/${id}`);
  }
  static previewLyrics(dto: {
    style: string;
    occasion: string;
    recipientName: string;
    message: string;
    voiceArtist: string;
    dedication?: string;
    tipAmount?: number;
    refine?: boolean;
  }): Promise<{ draft: string; refined?: string; locale: string }> {
    return http.post('/admin/chat/lyrics/preview', dto);
  }
  static thread(id: string): Promise<{ conversation: AdminChatConversation; messages: AdminChatMessage[] }> {
    return http.get(`/admin/chat/conversations/${id}`);
  }
  static reply(id: string, body: string): Promise<AdminChatMessage> {
    return http.post(`/admin/chat/conversations/${id}/messages`, { body });
  }
  /** Editează un mesaj admin existent. */
  static editMessage(messageId: string, body: string): Promise<AdminChatMessage> {
    return http.patch(`/admin/chat/messages/${messageId}`, { body });
  }
  /** Soft-delete mesaj. */
  static deleteMessage(messageId: string): Promise<{ ok: true }> {
    return http.delete(`/admin/chat/messages/${messageId}`);
  }
  static setAiMode(id: string, mode: AiChatMode): Promise<{ ok: true; aiMode: AiChatMode }> {
    return http.post(`/admin/chat/conversations/${id}/ai-mode`, { mode });
  }
  static forceOpen(id: string): Promise<{ ok: true; online: boolean; open: boolean }> {
    return http.post(`/admin/chat/conversations/${id}/force-open`, { open: true });
  }
  /** Forțează închiderea widget-ului pe client. */
  static forceClose(id: string): Promise<{ ok: true; online: boolean; open: boolean }> {
    return http.post(`/admin/chat/conversations/${id}/force-open`, { open: false });
  }
  /**
   * Claim/release conversație.
   *  - undefined / lipsă body → auto-claim de adminul curent
   *  - 'release' → eliberează
   *  - <uuid> → atribuie unui anume admin
   */
  static assignAdmin(
    id: string,
    target?: string | 'release' | null,
  ): Promise<{
    ok: true;
    assignedAdminId: string | null;
    assignedAdminEmail: string | null;
    assignedAt: string | null;
  }> {
    const body = target === undefined ? {} : { adminUserId: target };
    return http.post(`/admin/chat/conversations/${id}/assign`, body);
  }
  static uploadAttachment(id: string, file: File, caption?: string): Promise<AdminChatMessage> {
    const fd = new FormData();
    fd.append('file', file);
    if (caption) fd.append('caption', caption);
    return http.post(`/admin/chat/conversations/${id}/attachments`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60_000,
    });
  }
  static sendPaymentLink(id: string, opts: PaymentLinkOpts): Promise<AdminChatMessage> {
    return http.post(`/admin/chat/conversations/${id}/payment-link`, opts);
  }
  static approveSuggestion(messageId: string, editedText?: string): Promise<AdminChatMessage> {
    return http.post(`/admin/chat/suggestions/${messageId}/approve`, { editedText });
  }
  static rejectSuggestion(messageId: string): Promise<{ ok: true }> {
    return http.post(`/admin/chat/suggestions/${messageId}/reject`, {});
  }
  static launchGeneration(
    conversationId: string,
    dto: {
      paymentId: string;
      style: string;
      occasion: string;
      recipientName: string;
      message: string;
      voiceArtist: string;
      dedication?: string;
      customLyrics?: string;
      premium?: boolean;
      email?: string;
      tipAmount?: number;
    },
  ): Promise<{ generationId: string }> {
    return http.post(`/admin/chat/conversations/${conversationId}/launch-generation`, dto);
  }
  /**
   * Flux demo + plată: lansează generation type='demo' + trimite payment_link
   * cu metadata unlock-generation. La plată confirmată → unlock automat full.
   */
  // ====== Quick replies ======
  static listQuickReplies(): Promise<QuickReply[]> {
    return http.get('/admin/chat/quick-replies');
  }
  static createQuickReply(dto: { label: string; text: string; color?: string; sortOrder?: number }): Promise<QuickReply> {
    return http.post('/admin/chat/quick-replies', dto);
  }
  static updateQuickReply(id: string, dto: { label?: string; text?: string; color?: string; sortOrder?: number }): Promise<QuickReply> {
    return http.patch(`/admin/chat/quick-replies/${id}`, dto);
  }
  static deleteQuickReply(id: string): Promise<{ ok: true }> {
    return http.delete(`/admin/chat/quick-replies/${id}`);
  }

  static demoWithPayment(
    conversationId: string,
    dto: {
      style: string;
      occasion: string;
      recipientName: string;
      message: string;
      voiceArtist: string;
      dedication?: string;
      customLyrics?: string;
      premium?: boolean;
      tipAmount?: number;
      email?: string;
      amount: number;
      currency?: string;
      productName?: string;
    },
  ): Promise<{ generationId: string; paymentMessageId: string }> {
    return http.post(`/admin/chat/conversations/${conversationId}/demo-with-payment`, dto);
  }
}
