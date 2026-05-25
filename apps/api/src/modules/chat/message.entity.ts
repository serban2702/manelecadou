import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ChatMessageType =
  | 'text'
  | 'image'
  | 'file'
  | 'payment_link'
  | 'song_form_step'
  | 'song_preview'
  | 'system'
  | 'ai_suggestion';

export interface ChatMessagePayload {
  // payment_link
  amount?: number;
  currency?: string;
  description?: string;
  checkoutUrl?: string;
  paymentId?: string;
  // song_form_step
  step?: string;
  question?: string;
  options?: string[];
  formState?: Record<string, unknown>;
  // song_preview
  generationId?: string;
  audioUrl?: string;
  // ai_suggestion
  suggestedText?: string;
  basedOnMemoryIds?: string[];
  confidence?: number;
  // generic
  [k: string]: unknown;
}

@Entity({ name: 'chat_messages' })
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'uuid' })
  conversationId!: string;

  @Column({ type: 'varchar', length: 16 })
  authorRole!: 'user' | 'admin' | 'system';

  @Column({ type: 'uuid', nullable: true })
  authorId!: string | null;

  @Column({ type: 'text' })
  body!: string;

  // ====== Traducere multi-agent ======
  @Column({ type: 'varchar', length: 8, nullable: true })
  detectedLang!: string | null;

  /** Traducerea în RO (pentru mesaje primite în altă limbă). Null pentru ro sau netradus. */
  @Column({ type: 'text', nullable: true })
  bodyRo!: string | null;

  /** Scor consens între cei doi traducători. */
  @Column({ type: 'float', nullable: true })
  translationConsensus!: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  // ============== Faza 1: Rich messages + delivery receipts ==============

  /** Tipul mesajului — controlează renderer-ul în UI. Default 'text'. */
  @Column({ type: 'varchar', length: 32, default: 'text' })
  messageType!: ChatMessageType;

  /** Payload arbitrar pentru rich messages (payment link, form step, etc.). */
  @Column({ type: 'jsonb', nullable: true })
  payload!: ChatMessagePayload | null;

  /** Timestamp când receiver-ul a confirmat receipt-ul prin WS ACK. */
  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  /** Timestamp când receiver-ul a citit mesajul (chat deschis + viewport). */
  @Column({ type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  // ====== Atașamente ======
  @Column({ type: 'text', nullable: true })
  attachmentUrl!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  attachmentMime!: string | null;

  @Column({ type: 'integer', nullable: true })
  attachmentSize!: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  attachmentName!: string | null;

  // ====== AI provenance ======
  /** Mesaj generat sau sugerat de AI. */
  @Column({ type: 'boolean', default: false })
  aiGenerated!: boolean;

  /** Adminul care a aprobat sugestia AI (în mod 'suggest'). NULL = trimis direct (mod 'auto'). */
  @Column({ type: 'uuid', nullable: true })
  aiApprovedBy!: string | null;

  /** ID-ul mesajului user la care AI sugerează răspuns (pentru tracking). */
  @Column({ type: 'uuid', nullable: true })
  aiSuggestionFor!: string | null;
}
