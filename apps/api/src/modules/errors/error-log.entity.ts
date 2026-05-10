import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'error_logs' })
export class ErrorLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 16 })
  level!: 'error' | 'warn' | 'info';

  /** "api" | "web" | "admin" — sursa stack-ului */
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'api' })
  source!: 'api' | 'web' | 'admin';

  @Column({ type: 'varchar', length: 200 })
  message!: string;

  @Column({ type: 'text', nullable: true })
  stack!: string | null;

  /** HTTP path (ex /api/payments/checkout-session) — pe API */
  @Column({ type: 'varchar', length: 200, nullable: true })
  path!: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  method!: string | null;

  @Column({ type: 'integer', nullable: true })
  statusCode!: number | null;

  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  guestId!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip!: string | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  userAgent!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  meta!: Record<string, unknown> | null;

  /** Marcat ca rezolvat din admin */
  @Column({ type: 'boolean', default: false })
  resolved!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
