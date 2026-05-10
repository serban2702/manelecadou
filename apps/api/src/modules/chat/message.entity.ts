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

  @CreateDateColumn()
  createdAt!: Date;
}
