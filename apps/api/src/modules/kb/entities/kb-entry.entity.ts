import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'kb_entries' })
export class KbEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Column({ type: 'varchar', length: 300 })
  title!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'text', array: true, default: () => `'{}'::text[]` })
  tags!: string[];

  @Index()
  @Column({ type: 'varchar', length: 8, default: 'ro' })
  lang!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
