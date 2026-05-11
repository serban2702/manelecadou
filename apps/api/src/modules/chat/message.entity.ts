import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'chat_messages' })
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'uuid' })
  conversationId!: string;

  @Column({ type: 'varchar', length: 16 })
  authorRole!: 'user' | 'admin' | 'system';

  @Column({ type: 'uuid', nullable: true })
  authorId!: string | null;

  @Column({ type: 'text' })
  body!: string;

  // ====== Traducere multi-agent ======
  @Column({ type: 'varchar', length: 8, nullable: true })
  detectedLang!: string | null;

  /** Traducerea în RO (pentru mesaje primite în altă limbă). Null pentru ro sau netradus. */
  @Column({ type: 'text', nullable: true })
  bodyRo!: string | null;

  /** Scor consens între cei doi traducători. */
  @Column({ type: 'float', nullable: true })
  translationConsensus!: number | null;

  @CreateDateColumn()
  createdAt!: Date;
}
