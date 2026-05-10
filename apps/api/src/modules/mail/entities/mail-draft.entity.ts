import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { MailAddr } from './mail-message.entity';

@Entity({ name: 'mail_drafts' })
export class MailDraft {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'uuid' })
  accountId!: string;

  @Column({ type: 'uuid', nullable: true })
  inReplyToMessageId!: string | null;

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  toAddrs!: MailAddr[];

  @Column({ type: 'varchar', length: 500, default: '' })
  subject!: string;

  @Column({ type: 'text', default: '' })
  bodyHtml!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
