import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type MailDirection = 'in' | 'out';

export interface MailAddr {
  address: string;
  name?: string;
}

@Entity({ name: 'mail_messages' })
@Index(['accountId', 'messageId'], { unique: true, where: '"messageId" IS NOT NULL' })
@Index(['threadId', 'sentAt'])
export class MailMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'uuid' })
  accountId!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  folderId!: string | null;

  @Column({ type: 'bigint', nullable: true })
  uid!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 500, nullable: true })
  messageId!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  inReplyTo!: string | null;

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  references!: string[];

  @Index()
  @Column({ type: 'varchar', length: 500, nullable: true })
  threadId!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  fromAddr!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  fromName!: string | null;

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  toAddrs!: MailAddr[];

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  cc!: MailAddr[];

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  bcc!: MailAddr[];

  @Column({ type: 'varchar', length: 500, default: '' })
  subject!: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  snippet!: string;

  @Column({ type: 'text', nullable: true })
  bodyHtml!: string | null;

  @Column({ type: 'text', nullable: true })
  bodyText!: string | null;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  headers!: Record<string, string | string[]>;

  @Column({ type: 'integer', default: 0 })
  rawSize!: number;

  @Column({ type: 'boolean', default: false })
  seen!: boolean;

  @Column({ type: 'boolean', default: false })
  flagged!: boolean;

  @Column({ type: 'varchar', length: 4, default: 'in' })
  direction!: MailDirection;

  @Column({ type: 'boolean', default: false })
  aiGenerated!: boolean;

  /**
   * Mesaj arhivat — atașamentele sale sunt șterse local (fișiere + rânduri DB),
   * textul/HTML-ul rămâne. Arhivarea NU sincronizează cu serverul IMAP remote.
   */
  @Index()
  @Column({ type: 'boolean', default: false })
  archived!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  /**
   * True dacă atașamentele au fost șterse local (ex: după arhivare). UI-ul
   * afișează un avertisment ca să se știe de ce nu se mai pot descărca.
   */
  @Column({ type: 'boolean', default: false })
  attachmentsPurged!: boolean;

  @Column({ type: 'integer', default: 0 })
  attachmentCount!: number;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  receivedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
