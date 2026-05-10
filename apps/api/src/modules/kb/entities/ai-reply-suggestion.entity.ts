import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AiSuggestionStatus = 'pending' | 'sent' | 'dismissed' | 'edited' | 'auto_sent' | 'skipped';

@Entity({ name: 'ai_reply_suggestions' })
export class AiReplySuggestion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'uuid' })
  messageId!: string;

  @Column({ type: 'float', default: 0 })
  confidence!: number;

  @Column({ type: 'boolean', default: false })
  shouldReply!: boolean;

  @Column({ type: 'text', default: '' })
  htmlReply!: string;

  @Column({ type: 'text', default: '' })
  plainReply!: string;

  @Column({ type: 'text', default: '' })
  reasoning!: string;

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  usedKbIds!: string[];

  @Column({ type: 'varchar', length: 80, default: '' })
  model!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: AiSuggestionStatus;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
