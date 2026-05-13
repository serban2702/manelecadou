// Tipuri partajate între paginile admin. Importate din *.api.ts și componente.

export interface AdminStats {
  users: number;
  guests: number;
  generations: { total: number; demos: number; fulls: number; succeeded: number; failed: number; paidUnlocked: number };
  paidPayments: number;
  revenue: { totalCents: number; last7dCents: number };
  conversionRate: number;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: 'user' | 'admin';
  freeDemoUsed: boolean;
  createdAt: string;
  siteId?: string | null;
}

export interface AdminGuest {
  id: string;
  email: string | null;
  freeDemoUsed: boolean;
  userId: string | null;
  createdAt: string;
  lastSeenAt: string;
  siteId?: string | null;
}

export interface AdminGeneration {
  id: string;
  ownerUserId: string | null;
  ownerGuestId: string | null;
  type: 'demo' | 'full';
  status: string;
  durationSec: number;
  style: string;
  occasion: string;
  recipientName: string;
  message: string;
  voiceArtist: string;
  audioUrl: string | null;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
  siteId?: string | null;
}

export interface AdminChatConversation {
  id: string;
  siteId: string | null;
  userId: string | null;
  guestId: string | null;
  email: string | null;
  subject: string;
  unreadByAdmin: number;
  unreadByUser: number;
  status: 'open' | 'closed';
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  online: boolean;
  lastSeenAt: string | null;
}

export interface AdminChatMessage {
  id: string;
  conversationId: string;
  authorRole: 'user' | 'admin' | 'system';
  authorId: string | null;
  body: string;
  createdAt: string;
  detectedLang: string | null;
  bodyRo: string | null;
  translationConsensus: number | null;
}

export interface AdminPromoCode {
  id: string;
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  validFrom: string | null;
  validUntil: string | null;
  maxUses: number;
  usedCount: number;
  restrictedToEmail: string | null;
  active: boolean;
  note: string | null;
  createdAt: string;
  siteId?: string | null;
}

export interface AdminPayment {
  id: string;
  provider: string;
  amount: number;
  currency: string;
  status: string;
  userId: string | null;
  guestId: string | null;
  createdAt: string;
  siteId?: string | null;
  /** Motiv detaliat când status='failed' (extras din Stripe). */
  failureReason?: string | null;
  /** Cod scurt (decline_code, error code). */
  failureCode?: string | null;
  /** Email-ul plătitorului (user.email sau guest.email). */
  email?: string | null;
}

export interface AdminError {
  id: string; level: string; source: string; message: string;
  stack: string | null; path: string | null; method: string | null;
  statusCode: number | null; userId: string | null; guestId: string | null;
  ip: string | null; userAgent: string | null; resolved: boolean; createdAt: string;
  siteId?: string | null;
}

export interface AdminGiftCode {
  id: string; code: string; tier: 'single' | 'pack3' | 'pack10';
  usesLeft: number; totalUses: number;
  purchasedByEmail: string | null; purchasedByUserId: string | null;
  lastRedeemedAt: string | null;
  validUntil: string; active: boolean; createdAt: string;
  siteId?: string | null;
}

// ====== Mail Hub ======
export interface MailAccountSafe {
  id: string;
  siteId: string | null;
  label: string;
  email: string;
  fromName: string | null;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  signatureHtml: string | null;
  autoReplyEnabled: boolean;
  autoReplyThreshold: number;
  syncEnabled: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  imapPassMask: string;
  smtpPassMask: string;
  createdAt: string;
  updatedAt: string;
}

export interface MailAccountInputDto {
  siteId: string | null;
  label: string;
  email: string;
  fromName?: string | null;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  imapPass?: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass?: string;
  signatureHtml?: string | null;
  autoReplyEnabled?: boolean;
  autoReplyThreshold?: number;
  syncEnabled?: boolean;
}

export interface MailTestResult {
  imap: { ok: boolean; error?: string };
  smtp: { ok: boolean; error?: string };
}

export interface MailFolderRow {
  id: string;
  accountId: string;
  path: string;
  name: string;
  role: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' | 'other';
  uidValidity: string;
  lastUid: string;
  unreadCount: number;
  totalCount: number;
}

export interface MailAddrLite { address: string; name?: string }

export interface MailMessageRow {
  id: string;
  siteId: string | null;
  accountId: string;
  folderId: string | null;
  uid: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  threadId: string | null;
  fromAddr: string | null;
  fromName: string | null;
  toAddrs: MailAddrLite[];
  cc: MailAddrLite[];
  bcc: MailAddrLite[];
  subject: string;
  snippet: string;
  bodyHtml: string | null;
  bodyText: string | null;
  rawSize: number;
  seen: boolean;
  flagged: boolean;
  direction: 'in' | 'out';
  aiGenerated: boolean;
  archived: boolean;
  archivedAt: string | null;
  attachmentsPurged: boolean;
  attachmentCount: number;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  detectedLang: string | null;
  bodyTextRo: string | null;
  bodyHtmlRo: string | null;
  translationConsensus: number | null;
}

export interface MailAttachmentRow {
  id: string;
  messageId: string;
  filename: string;
  mime: string;
  size: number;
  contentId: string | null;
  inline: boolean;
  createdAt: string;
}

export interface AiReplySuggestionRow {
  id: string;
  messageId: string;
  confidence: number;
  shouldReply: boolean;
  htmlReply: string;
  plainReply: string;
  reasoning: string;
  usedKbIds: string[];
  model: string;
  status: 'pending' | 'sent' | 'dismissed' | 'edited' | 'auto_sent' | 'skipped';
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KbEntryRow {
  id: string;
  title: string;
  content: string;
  tags: string[];
  lang: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// ====== Settings ======
export type SettingKind = 'string' | 'number' | 'bool' | 'secret' | 'select' | 'longtext';

export interface SettingView {
  key: string;
  label: string;
  description?: string;
  kind: SettingKind;
  options?: string[];
  encrypted: boolean;
  hotReload: boolean;
  requiresRestart: boolean;
  placeholder?: string;
  value: string;
  source: 'db' | 'env' | 'unset';
  hasDbValue: boolean;
}

export interface SettingCategoryView {
  id: string;
  title: string;
  description?: string;
  settings: SettingView[];
}

// ====== Suno ======
export interface SunoSummary {
  defaultCostPerGenerate: number;
  purchased: { credits: number; amountRon: number; amountUsd: number };
  used: { credits: number; last24hCredits: number; ronEstimate: number };
  balance: { credits: number; ronPerCredit: number };
  outcomeCounts: Record<string, number>;
}

export interface SunoLog {
  id: string;
  generationId: string | null;
  endpoint: string;
  requestType: string;
  responseStatus: number | null;
  taskId: string | null;
  providerStatus: string | null;
  outcome: 'pending' | 'success' | 'failed' | 'http_error' | 'timeout';
  errorMessage: string | null;
  costCredits: number;
  createdAt: string;
  completedAt: string | null;
}

export interface SunoLogDetail extends SunoLog {
  requestBody: unknown;
  responseBody: unknown;
}

export interface SunoPurchase {
  id: string;
  credits: number;
  amountRon: number;
  amountUsd: number | null;
  notes: string | null;
  purchasedAt: string;
  createdAt: string;
  recordedByEmail: string | null;
}

// ====== Analytics ======
export interface AnalyticsRange { from: string; to: string }

export interface AnalyticsOverview {
  range: AnalyticsRange;
  sessions: number;
  visitors: number;
  pageViews: number;
  avgSessionSec: number;
  bounceRate: number;
  revenueCents: number;
  paidCount: number;
  pixelRevenueCents: number;
  pixelPurchases: number;
  eventCounts: Record<string, number>;
  previous: { sessions: number; visitors: number; revenueCents: number };
}
