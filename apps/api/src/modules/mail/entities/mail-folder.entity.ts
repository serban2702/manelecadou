import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type MailFolderRole = 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' | 'other';

@Entity({ name: 'mail_folders' })
@Unique(['accountId', 'path'])
export class MailFolder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'uuid' })
  accountId!: string;

  @Column({ type: 'varchar', length: 500 })
  path!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 16, default: 'other' })
  role!: MailFolderRole;

  @Column({ type: 'bigint', default: 0 })
  uidValidity!: string;

  @Column({ type: 'bigint', default: 0 })
  lastUid!: string;

  @Column({ type: 'integer', default: 0 })
  unreadCount!: number;

  @Column({ type: 'integer', default: 0 })
  totalCount!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
