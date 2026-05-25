import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AiChatMode = 'manual' | 'suggest' | 'auto';

@Entity({ name: 'conversations' })
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  guestId!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 200, default: 'Conversație' })
  subject!: string;

  @Column({ type: 'integer', default: 0 })
  unreadByAdmin!: number;

  @Column({ type: 'integer', default: 0 })
  unreadByUser!: number;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: 'open' | 'closed';

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastMessageAt!: Date | null;

  // ============== Faza 1: AI Mode + presence snapshot ==============

  /**
   * Modul AI pentru această conversație:
   *  - manual: AI-ul nu intervine
   *  - suggest: AI generează sugestii, adminul aprobă înainte de send
   *  - auto: AI răspunde singur (cu guardrails pentru acțiuni sensibile)
   * Default per site se setează în settings (AI_CHAT_MODE_DEFAULT).
   */
  @Column({ type: 'varchar', length: 16, default: 'manual' })
  aiMode!: AiChatMode;

  /** Ultima stare cunoscută a widget-ului (deschis/închis). Updated live prin WS. */
  @Column({ type: 'boolean', default: false })
  chatOpenOnClient!: boolean;

  /** Ultima rută pe care a fost văzut clientul (ex. /generator, /cadou/success). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  lastClientPath!: string | null;

  /** Snapshot device (type, os, browser, viewport). Pentru sidebar admin. */
  @Column({ type: 'jsonb', nullable: true })
  lastDevice!: {
    type?: 'mobile' | 'tablet' | 'desktop';
    os?: string;
    browser?: string;
    viewport?: { w: number; h: number };
    userAgent?: string;
  } | null;

  /** Momentul ultimei conectări WS (start timer "este pe site de X minute"). */
  @Column({ type: 'timestamptz', nullable: true })
  connectedAt!: Date | null;

  /** Momentul ultimei deconectări (după debounce de 5s). */
  @Column({ type: 'timestamptz', nullable: true })
  disconnectedAt!: Date | null;
}
