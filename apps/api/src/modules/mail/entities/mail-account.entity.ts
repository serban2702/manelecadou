import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'mail_accounts' })
export class MailAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Column({ type: 'varchar', length: 120 })
  label!: string;

  @Index()
  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  fromName!: string | null;

  // IMAP
  @Column({ type: 'varchar', length: 200 })
  imapHost!: string;

  @Column({ type: 'integer', default: 993 })
  imapPort!: number;

  @Column({ type: 'boolean', default: true })
  imapSecure!: boolean;

  @Column({ type: 'varchar', length: 320 })
  imapUser!: string;

  @Column({ type: 'text' })
  imapPassEnc!: string;

  // SMTP
  @Column({ type: 'varchar', length: 200 })
  smtpHost!: string;

  @Column({ type: 'integer', default: 465 })
  smtpPort!: number;

  @Column({ type: 'boolean', default: true })
  smtpSecure!: boolean;

  @Column({ type: 'varchar', length: 320 })
  smtpUser!: string;

  @Column({ type: 'text' })
  smtpPassEnc!: string;

  // Branding & AI
  @Column({ type: 'text', nullable: true })
  signatureHtml!: string | null;

  @Column({ type: 'boolean', default: false })
  autoReplyEnabled!: boolean;

  @Column({ type: 'float', default: 0.8 })
  autoReplyThreshold!: number;

  @Column({ type: 'boolean', default: true })
  syncEnabled!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
