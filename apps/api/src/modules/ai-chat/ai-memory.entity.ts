import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AiMemoryKind =
  | 'fact'        // brand fact (preț, livrare, garanție)
  | 'faq'         // întrebare frecventă + răspuns canonic
  | 'tone_example'// exemplu de ton (Q user → A admin care a funcționat)
  | 'edge_case'   // situație specială (refund, bug, escaladare)
  | 'product'     // detaliu produs (stiluri, voci, opțiuni)
  | 'policy';     // politică (TOS, GDPR, refund window)

/**
 * AI Memory — fapte/cunoștințe pe care AI-ul le folosește în system prompt.
 * Adăugate manual de admin sau extrase nocturn de AILearnerService din conversații
 * rezolvate. Doar `approved=true` intră în prompt la runtime.
 */
@Entity({ name: 'ai_memory' })
@Index('idx_ai_memory_site_approved', ['siteId', 'approved'])
export class AiMemory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  kind!: AiMemoryKind;

  @Column({ type: 'text' })
  content!: string;

  /** Source conversation (dacă a fost extras automat). */
  @Column({ type: 'uuid', nullable: true })
  sourceConversationId!: string | null;

  /** Mesajele din care a fost extras (pentru audit). */
  @Column({ type: 'jsonb', nullable: true })
  extractedFrom!: { messageIds: string[]; snippet?: string } | null;

  /** Doar approved=true intră în system prompt. Fals = în coadă de review. */
  @Column({ type: 'boolean', default: false })
  approved!: boolean;

  /** De câte ori a fost inclus în prompt (proxy pentru utilitate). */
  @Column({ type: 'integer', default: 0 })
  usageCount!: number;

  /** Cine a aprobat (admin user ID). NULL = adăugat de cron, neaprobat. */
  @Column({ type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
