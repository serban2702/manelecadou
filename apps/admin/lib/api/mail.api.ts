import { http } from '../http/client';
import { getAdminToken } from '../http/client';
import type {
  AiReplySuggestionRow,
  MailAccountInputDto,
  MailAccountSafe,
  MailAttachmentRow,
  MailDraftRow,
  MailFolderRole,
  MailFolderRow,
  MailFolderSummary,
  MailMessageRow,
  MailTestResult,
  MailThreadRow,
  StagedAttachment,
} from '../types';

export class MailApi {
  // ===== Accounts =====
  static accounts(): Promise<MailAccountSafe[]> {
    return http.get('/admin/mail/accounts');
  }
  static accountCreate(input: MailAccountInputDto): Promise<MailAccountSafe> {
    return http.post('/admin/mail/accounts', input);
  }
  static accountUpdate(id: string, input: Partial<MailAccountInputDto>): Promise<MailAccountSafe> {
    return http.patch(`/admin/mail/accounts/${id}`, input);
  }
  static accountDelete(id: string): Promise<{ ok: true }> {
    return http.delete(`/admin/mail/accounts/${id}`);
  }
  static accountTestStored(id: string): Promise<MailTestResult> {
    return http.post(`/admin/mail/accounts/${id}/test`);
  }
  static accountTestCreds(input: MailAccountInputDto): Promise<MailTestResult> {
    return http.post('/admin/mail/accounts/test', input);
  }
  static accountSync(id: string): Promise<{ ok: true }> {
    return http.post(`/admin/mail/accounts/${id}/sync`);
  }
  static accountFolders(id: string): Promise<MailFolderRow[]> {
    return http.get(`/admin/mail/accounts/${id}/folders`);
  }

  // ===== Messages =====
  static messages(params: { accountId?: string; folderId?: string; role?: MailFolderRole; q?: string; limit?: number; archived?: 'true' | 'false' | 'all' } = {}): Promise<MailMessageRow[]> {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, String(v)); });
    return http.get(`/admin/mail/messages${qs.toString() ? '?' + qs.toString() : ''}`);
  }
  /**
   * Lista grupată pe conversații (un rând per thread, cele mai recente primele).
   * Aceleași filtre ca `messages()`; `limit` numără thread-uri, nu mesaje.
   */
  static threads(params: { accountId?: string; folderId?: string; role?: MailFolderRole; q?: string; limit?: number; archived?: 'true' | 'false' | 'all' } = {}): Promise<MailThreadRow[]> {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, String(v)); });
    return http.get(`/admin/mail/threads${qs.toString() ? '?' + qs.toString() : ''}`);
  }
  /** Contoare pentru sidebar-ul de foldere. */
  static folderSummary(accountId?: string): Promise<MailFolderSummary> {
    const qs = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
    return http.get(`/admin/mail/folders/summary${qs}`);
  }
  static message(id: string): Promise<{ message: MailMessageRow; attachments: MailAttachmentRow[]; suggestion: AiReplySuggestionRow | null }> {
    return http.get(`/admin/mail/messages/${id}`);
  }
  static thread(threadId: string): Promise<MailMessageRow[]> {
    return http.get(`/admin/mail/threads/${encodeURIComponent(threadId)}`);
  }
  static messagePatch(id: string, body: { seen?: boolean; flagged?: boolean }): Promise<MailMessageRow> {
    return http.patch(`/admin/mail/messages/${id}`, body);
  }
  static reply(id: string, body: { html: string; to?: string[]; cc?: string[]; subject?: string; attachmentIds?: string[] }): Promise<MailMessageRow> {
    return http.post(`/admin/mail/messages/${id}/reply`, body);
  }
  /** Compune și trimite un email NOU dintr-un cont (prin pipeline-ul platformei). */
  static compose(body: { accountId: string; to: string[]; cc?: string[]; bcc?: string[]; subject: string; html: string; attachmentIds?: string[] }): Promise<MailMessageRow> {
    return http.post('/admin/mail/compose', body);
  }
  /** Redirecționează un mesaj primit către alt destinatar. */
  static forward(id: string, body: { to: string[]; cc?: string[]; html?: string; includeAttachments?: boolean }): Promise<MailMessageRow> {
    return http.post(`/admin/mail/messages/${id}/forward`, body);
  }
  /** Mută mesajul în alt folder (pe server + local). */
  static move(id: string, folderId: string): Promise<MailMessageRow> {
    return http.post(`/admin/mail/messages/${id}/move`, { folderId });
  }
  static archive(id: string): Promise<MailMessageRow> {
    return http.post(`/admin/mail/messages/${id}/archive`);
  }
  static unarchive(id: string): Promise<MailMessageRow> {
    return http.post(`/admin/mail/messages/${id}/unarchive`);
  }
  /** Mută în Coș pe server; dacă mesajul e deja în Coș, îl șterge definitiv. */
  static deleteMessage(id: string): Promise<{ ok: true; trashed: boolean }> {
    return http.delete(`/admin/mail/messages/${id}`);
  }

  // ===== Atașamente la trimitere =====

  /**
   * Încarcă un fișier de atașat și întoarce id-ul lui de staging, folosit apoi
   * la compose/reply. Merge prin fetch direct (nu prin `http`) pentru multipart.
   */
  static async uploadOutboxAttachment(file: File): Promise<StagedAttachment> {
    const token = getAdminToken();
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:1501';
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${baseUrl}/api/admin/mail/outbox-attachments`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message ?? `Încărcare eșuată (${res.status})`);
    }
    return res.json();
  }

  static discardOutboxAttachment(id: string): Promise<{ ok: true }> {
    return http.delete(`/admin/mail/outbox-attachments/${id}`);
  }

  // ===== Ciorne (autosave din compose) =====
  static latestDraft(accountId: string): Promise<MailDraftRow | null> {
    return http.get(`/admin/mail/drafts/latest?accountId=${encodeURIComponent(accountId)}`);
  }
  static saveDraft(body: {
    id?: string;
    accountId: string;
    to?: string[];
    subject?: string;
    html?: string;
    inReplyToMessageId?: string;
  }): Promise<MailDraftRow> {
    return http.post('/admin/mail/drafts', body);
  }
  static deleteDraft(id: string): Promise<{ ok: true }> {
    return http.delete(`/admin/mail/drafts/${id}`);
  }

  // ===== AI suggestions =====
  static suggestionSend(id: string): Promise<unknown> {
    return http.post(`/admin/mail/suggestions/${id}/send`);
  }
  static suggestionDismiss(id: string): Promise<AiReplySuggestionRow> {
    return http.post(`/admin/mail/suggestions/${id}/dismiss`);
  }

  // ===== Misc =====
  static unreadTotal(): Promise<{ unread: number }> {
    return http.get('/admin/mail/unread-total');
  }

  /**
   * Descarcă un atașament. Folosește fetch+Blob ca să trimită Bearer token.
   * Backend-ul forțează `Content-Disposition: attachment` + `nosniff` + CSP.
   */
  static async downloadAttachment(id: string, filename: string): Promise<void> {
    const token = getAdminToken();
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:1501';
    const res = await fetch(`${baseUrl}/api/admin/mail/attachments/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Descărcare eșuată (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
