import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AiChatMode = 'manual' | 'suggest' | 'auto';

/**
 * Wizard state pentru AI sales concierge — colectează pas cu pas datele
 * necesare pentru a comanda o manea în chat, apoi creează Generation + Checkout.
 *
 *  collecting → review → payment_sent → paid → generating → completed
 */
export type WizardStep =
  | 'idle'           // userul n-a manifestat încă intenție de cumpărare
  | 'collecting'     // AI întreabă pas cu pas
  | 'review'         // toate datele complete, AI cere confirmare
  | 'payment_sent'   // wizard_finalize executat, payment_link trimis, așteptăm plata
  | 'paid'           // webhook Stripe confirmat
  | 'generating'     // Suno în lucru
  | 'completed';     // audio livrat

export interface WizardData {
  style?: string;
  occasion?: string;
  recipientName?: string;
  /** „De la" — cine dedică (optional, conform structurii Irinei). */
  dedicatorName?: string;
  message?: string;
  voiceArtist?: string;
  /** Sex destinatar (M/F) folosit pt inferarea automată a vocii când userul nu o alege. */
  recipientGender?: 'M' | 'F';
  dedication?: string;
  customLyrics?: string;
  /** @deprecated înlocuit de packageTier (model 3 pachete). Păstrat pt compat. */
  premium?: boolean;
  /** Pachetul ales de user în chat: basic | plus | premium. Default basic. */
  packageTier?: 'basic' | 'plus' | 'premium';
}

export interface WizardState {
  step: WizardStep;
  data: WizardData;
  generationId?: string | null;
  paymentId?: string | null;
  /** Câte link-uri de plată au fost trimise pe această conv (cap 2 — anti-spam). */
  linkReissueCount?: number;
  updatedAt: string; // ISO
}

@Entity({ name: 'conversations' })
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  guestId!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 200, default: 'Conversație' })
  subject!: string;

  @Column({ type: 'integer', default: 0 })
  unreadByAdmin!: number;

  @Column({ type: 'integer', default: 0 })
  unreadByUser!: number;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: 'open' | 'closed';

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastMessageAt!: Date | null;

  // ============== Faza 1: AI Mode + presence snapshot ==============

  /**
   * Modul AI pentru această conversație:
   *  - manual: AI-ul nu intervine
   *  - suggest: AI generează sugestii, adminul aprobă înainte de send
   *  - auto: AI răspunde singur (cu guardrails pentru acțiuni sensibile)
   * Default per site se setează în settings (AI_CHAT_MODE_DEFAULT).
   */
  @Column({ type: 'varchar', length: 16, default: 'manual' })
  aiMode!: AiChatMode;

  /** Ultima stare cunoscută a widget-ului (deschis/închis). Updated live prin WS. */
  @Column({ type: 'boolean', default: false })
  chatOpenOnClient!: boolean;

  /** Ultima rută pe care a fost văzut clientul (ex. /generator, /cadou/success). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  lastClientPath!: string | null;

  /** Snapshot device (type, os, browser, viewport). Pentru sidebar admin. */
  @Column({ type: 'jsonb', nullable: true })
  lastDevice!: {
    type?: 'mobile' | 'tablet' | 'desktop';
    os?: string;
    browser?: string;
    viewport?: { w: number; h: number };
    userAgent?: string;
  } | null;

  /** Momentul ultimei conectări WS (start timer "este pe site de X minute"). */
  @Column({ type: 'timestamptz', nullable: true })
  connectedAt!: Date | null;

  /** Momentul ultimei deconectări (după debounce de 5s). */
  @Column({ type: 'timestamptz', nullable: true })
  disconnectedAt!: Date | null;

  /** Conversație arhivată — nu apare în lista default (doar la filtru explicit). */
  @Column({ type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  /**
   * State machine pentru AI sales wizard. Persistă datele colectate de AI prin
   * întrebări succesive (stil, ocazie, beneficiar, mesaj, voce). La finalize:
   * creează Generation pending + Stripe checkout + trimite payment_link.
   * NULL = userul n-a intrat încă în flow-ul de comandă.
   */
  @Column({ type: 'jsonb', nullable: true })
  wizardState!: WizardState | null;

  /**
   * Admin user-ul care s-a auto-atribuit la această conversație (claim).
   * Folosit ca să vadă echipa cine se ocupă activ de un client și să evite
   * dubla intervenție. NULL = neclaimed (oricine poate prelua).
   */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  assignedAdminId!: string | null;

  /** Email-ul admin-ului asignat (denormalizat pentru afișare rapidă în UI). */
  @Column({ type: 'varchar', length: 320, nullable: true })
  assignedAdminEmail!: string | null;

  /** Momentul claim-ului. */
  @Column({ type: 'timestamptz', nullable: true })
  assignedAt!: Date | null;

  /** Marcată ca favorită de admin (pentru filtru rapid în sidebar). */
  @Column({ type: 'boolean', default: false })
  @Index()
  isFavorite!: boolean;

  /** Notă privată a adminului — pentru when reviens la conversație (TODO, status...). */
  @Column({ type: 'text', nullable: true })
  adminNote!: string | null;

  // ============== AI Sales Agent (Faza 6) — Irina virtuală ==============

  /**
   * Momentul în care AI-ul a trimis primul salut proactiv pe această conversație.
   * Anti-spam: dacă != null, NU mai salutăm a doua oară (chiar dacă userul revine
   * după ore/zile pe site cu același guestId).
   */
  @Column({ type: 'timestamptz', nullable: true })
  greetingSentAt!: Date | null;

  /**
   * Câte mesaje de empatie a trimis AI-ul în această conv (condoleanțe / „să-ți
   * trăiască" etc.). Hard cap 2 per conv pentru a nu suna fals/spam.
   */
  @Column({ type: 'integer', default: 0 })
  empathyMessagesSent!: number;

  /**
   * Ultimul IP cunoscut al user-ului/guest-ului. Persistat la fiecare WS connect.
   * Sursă fallback robustă când analytics_sessions n-are date (user nou care n-a
   * trimis încă pageview) sau când gateway memory s-a curățat (API restart).
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  lastIp!: string | null;
}
