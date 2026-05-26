import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Răspuns predefinit pentru chat admin. Click în sidebar → text bagat în
 * input-ul de reply. Per-site (text depinde de limbă) cu sortare manuală.
 */
@Entity({ name: 'chat_quick_replies' })
export class QuickReply {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  /** Eticheta scurtă afișată pe buton (ex. „Bun venit", „Preț"). */
  @Column({ type: 'varchar', length: 120 })
  label!: string;

  /** Textul efectiv care se bagă în input (max ~2000). */
  @Column({ type: 'text' })
  text!: string;

  /** Culoarea butonului (hex, #d4af37 default). */
  @Column({ type: 'varchar', length: 16, default: '#d4af37' })
  color!: string;

  /** Ordine de afișare (mai mic = primul). */
  @Column({ type: 'integer', default: 0 })
  sortOrder!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
