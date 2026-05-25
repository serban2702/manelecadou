import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * AI Tool Call audit — fiecare apel de tool al AI-ului e logat pentru:
 *  - Cost tracking (tokens + model + duration)
 *  - Debug ("de ce AI a trimis acel mesaj?")
 *  - Safety review pentru tools sensitive (send_payment_link, force_open_chat)
 */
@Entity({ name: 'ai_tool_calls' })
@Index('idx_ai_tool_calls_conv_created', ['conversationId', 'createdAt'])
export class AiToolCall {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'uuid' })
  conversationId!: string;

  /** Mesajul user care a declanșat runul (sau NULL pentru proactive). */
  @Column({ type: 'uuid', nullable: true })
  triggerMessageId!: string | null;

  /** Numele tool-ului (send_message, search_memory, etc.) */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  toolName!: string;

  /** Argumentele cu care a fost apelat. */
  @Column({ type: 'jsonb', nullable: true })
  input!: Record<string, unknown> | null;

  /** Output-ul returnat handlerului (sau eroarea). */
  @Column({ type: 'jsonb', nullable: true })
  output!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  /** Modul AI activ la momentul apelului. */
  @Column({ type: 'varchar', length: 16 })
  aiMode!: 'manual' | 'suggest' | 'auto';

  /** Modelul OpenAI folosit (gpt-5, gpt-4o, etc). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  model!: string | null;

  /** Tokens total pentru tot agent run-ul (nu doar acest tool). Util pentru cost amortizat. */
  @Column({ type: 'integer', nullable: true })
  totalPromptTokens!: number | null;

  @Column({ type: 'integer', nullable: true })
  totalCompletionTokens!: number | null;

  /** True dacă tool-ul a fost gated pe approval (ex. send_payment_link în auto cu approval ON). */
  @Column({ type: 'boolean', default: false })
  requiredApproval!: boolean;

  /** Cine a aprobat (dacă requiredApproval). NULL = încă pending sau auto-executat. */
  @Column({ type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
