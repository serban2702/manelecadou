import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'mail_attachments' })
export class MailAttachment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  messageId!: string;

  @Column({ type: 'varchar', length: 300 })
  filename!: string;

  @Column({ type: 'varchar', length: 200, default: 'application/octet-stream' })
  mime!: string;

  @Column({ type: 'integer', default: 0 })
  size!: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  contentId!: string | null;

  @Column({ type: 'text' })
  storagePath!: string;

  @Column({ type: 'boolean', default: false })
  inline!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
