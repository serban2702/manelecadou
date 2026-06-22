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
  /** Date din cea mai recentă analytics_session asociată guestului. */
  analytics?: {
    country: string | null;
    countryName: string | null;
    city: string | null;
    device: string | null;
    browserName: string | null;
    osName: string | null;
    source: string | null;
    medium: string | null;
    pageViews: number;
    durationSec: number;
    isBot: boolean;
    botCategory: string;
  } | null;
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
  paymentId?: string | null;
  paidUnlocked?: boolean;
  retryCount?: number;
  /** Reîncercări automate (Suno căzut / fără credite). Separat de retryCount (manual). */
  autoRetryCount?: number;
  /** Următoarea reîncercare automată plănuită (ISO). NULL = nu mai retry-uim. */
  nextRetryAt?: string | null;
  lastRetryAt?: string | null;
  /** Marker upload manual din admin (sare peste Suno API). */
  providerJobId?: string | null;
  /** Pachetul ales (model nou cu 3 pachete). Lipsește la comenzile legacy. */
  packageTier?: 'basic' | 'plus' | 'premium';
  /** Imagini social generate pentru livrabile. */
  socialImages?: string[];
  /** Imaginea social selectată de client. */
  socialImageSelected?: string | null;
  /** Imaginea social încărcată manual. */
  socialImageUploaded?: string | null;
  /** URL piesă instrumentală (livrabil pachet). */
  instrumentalUrl?: string | null;
  /** URL videoclip (livrabil pachet). */
  videoUrl?: string | null;
  /** Email-ul owner-ului (user.email sau guest.email). Populat de listGenerations. */
  ownerEmail?: string | null;
  /** Plata legată de această generare (via paymentId). Populat de listGenerations. */
  payment?: {
    id: string;
    amount: number;
    currency: string;
    status: string;
    provider: string;
    createdAt: string;
  } | null;
}

export type AiChatMode = 'manual' | 'suggest' | 'auto';

/** Snapshot al formularului Generator de pe site (presence:form_state). */
export interface GeneratorFormState {
  /** Index 0-based al pasului curent. */
  step: number;
  /** Numele localizat al pasului, cum îl vede userul (ex. „Detalii"). */
  stepName?: string;
  totalSteps?: number;
  /** Câmpurile completate (style, occ, name, msg, voice, dedic, packageTier, customLyrics). */
  data?: Record<string, string | number | boolean>;
  /** Opțiunile valide per-site pentru selecții (stil/ocazie/voce), trimise de client. */
  options?: {
    styles?: Array<{ id: string; nm: string; em?: string }>;
    occasions?: Array<{ id: string; nm: string; em?: string }>;
    voices?: Array<{ id: string; nm: string }>;
  };
  generationId?: string | null;
  updatedAt: string;
}

export interface EnrichedPresence {
  online: boolean;
  connectedAt: string | null;
  lastSeenAt: string | null;
  currentPath: string | null;
  currentTitle: string | null;
  chatOpen: boolean;
  device: {
    type?: 'mobile' | 'tablet' | 'desktop';
    os?: string;
    browser?: string;
    viewport?: { w: number; h: number };
    userAgent?: string;
  } | null;
  ip: string | null;
  /** Starea formularului Generator de pe site — completat live de client. */
  formState?: GeneratorFormState | null;
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
  /** Ultimul IP cunoscut (analytics_sessions sau handshake WS chat). */
  ip: string | null;
  /** Rolul autorului ultimului mesaj din conversație (null = fără mesaje). */
  lastMessageRole: 'user' | 'admin' | null;
  // Faza 1
  aiMode?: AiChatMode;
  chatOpenOnClient?: boolean;
  lastClientPath?: string | null;
  enriched?: EnrichedPresence | null;
  // Assignment (claim admin)
  assignedAdminId?: string | null;
  assignedAdminEmail?: string | null;
  assignedAt?: string | null;
  // Favorite + note
  isFavorite?: boolean;
  adminNote?: string | null;
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
  // Faza 1
  messageType?: 'text' | 'image' | 'file' | 'payment_link' | 'song_form_step' | 'song_preview' | 'system' | 'ai_suggestion';
  payload?: Record<string, unknown> | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  attachmentUrl?: string | null;
  attachmentMime?: string | null;
  attachmentSize?: number | null;
  attachmentName?: string | null;
  aiGenerated?: boolean;
  editedAt?: string | null;
  deletedAt?: string | null;
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
  /** IP-ul cumpărătorului la momentul plății (poate fi IPv4 sau IPv6). */
  ipAddress?: string | null;
  /** ID-ul sesiunii OpenReplay asociate plății (pentru replay). */
  openReplaySessionId?: string | null;
  /** Motiv detaliat când status='failed' (extras din Stripe). */
  failureReason?: string | null;
  /** Cod scurt (decline_code, error code). */
  failureCode?: string | null;
  /** Email-ul plătitorului (user.email sau guest.email). */
  email?: string | null;
  /** Attribution last-touch: cea mai recentă sesiune a userului/guest-ului
   *  înainte de plată (cu source non-null). `null` pentru plăți fără sesiune
   *  matchabilă — de obicei plăți foarte vechi de dinaintea analytics-ului. */
  attribution?: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
    /** Nume campanie rezolvat (ID Meta → nume real din ad_spend), decodat. */
    campaignName: string | null;
    /** Creativul/ad-ul (utm_content) rezolvat la nume real (ad_spend.adName), decodat. */
    creative: string | null;
    referrer: string | null;
    landingPath: string | null;
  } | null;
  /** Generarea legată (când `generations.paymentId == payment.id`). */
  generation?: {
    id: string;
    status: string;
    type: 'demo' | 'full';
    recipientName: string;
    paidUnlocked: boolean;
    audioUrl: string | null;
    nextRetryAt: string | null;
    retryCount: number;
  } | null;
  /** Factura asociată plății (UNIQUE pe paymentId). null dacă nu s-a emis. */
  invoice?: { id: string; status: 'issued' | 'failed' } | null;
}

export interface AdminError {
  id: string; level: string; source: string; message: string;
  stack: string | null; path: string | null; method: string | null;
  statusCode: number | null; userId: string | null; guestId: string | null;
  ip: string | null; userAgent: string | null; resolved: boolean; createdAt: string;
  siteId?: string | null;
  openReplaySessionId?: string | null;
}

export interface AdminOutboundEmail {
  id: string;
  siteId: string | null;
  kind: string | null;
  status: 'queued' | 'sent' | 'failed';
  to: string;
  fromAddress: string | null;
  replyTo?: string | null;
  subject: string;
  html?: string | null;
  text?: string | null;
  provider: string | null;
  providerMessageId: string | null;
  providerNotes?: string | null;
  errorMessage: string | null;
  userId: string | null;
  relatedId: string | null;
  openReplaySessionId: string | null;
  createdAt: string;
  finalizedAt: string | null;
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

// ====== Lyrics (OpenAI logs) ======
export type LyricsLogStage = 'writer' | 'critic';
export type LyricsLogOutcome = 'pending' | 'success' | 'failed' | 'mock_fallback';

export interface LyricsLog {
  id: string;
  siteId: string | null;
  generationId: string | null;
  stage: LyricsLogStage;
  model: string | null;
  locale: string | null;
  responseStatus: number | null;
  tokensPrompt: number | null;
  tokensCompletion: number | null;
  tokensTotal: number | null;
  durationMs: number | null;
  outcome: LyricsLogOutcome;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface LyricsLogDetail extends LyricsLog {
  systemPrompt: string;
  userPrompt: string;
  responseContent: string | null;
  responseBody: unknown;
}

export interface LyricsSummary {
  total: number;
  totalTokens: number;
  totalTokensPrompt: number;
  totalTokensCompletion: number;
  last24h: { count: number; tokens: number };
  outcomeCounts: Record<string, number>;
  stageCounts: Record<string, number>;
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
