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
  message?: string;
  voiceArtist?: string;
  dedication?: string;
  customLyrics?: string;
  premium?: boolean;
}

export interface WizardState {
  step: WizardStep;
  data: WizardData;
  generationId?: string | null;
  paymentId?: string | null;
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
}
