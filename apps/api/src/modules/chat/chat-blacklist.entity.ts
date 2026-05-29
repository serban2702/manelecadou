import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export type ChatBlacklistType = 'ip' | 'email';

/**
 * Persoană blocată din chat, per-site. Match după IP exact sau email (lowercased).
 * Enforced la WS connect (IP) și la fiecare mesaj user (IP + email). Adminul
 * blochează direct dintr-o conversație ("din latura de chat") sau gestionează
 * lista manual.
 */
@Entity({ name: 'chat_blacklist' })
@Unique('uq_chat_blacklist_site_type_value', ['siteId', 'type', 'value'])
export class ChatBlacklist {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  /** 'ip' sau 'email'. */
  @Column({ type: 'varchar', length: 16 })
  type!: ChatBlacklistType;

  /** IP-ul exact sau email-ul (lowercase + trim). */
  @Column({ type: 'varchar', length: 320 })
  value!: string;

  /** Motiv opțional notat de admin. */
  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  /** Email-ul adminului care a adăugat blocarea (denormalizat). */
  @Column({ type: 'varchar', length: 320, nullable: true })
  createdByEmail!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
