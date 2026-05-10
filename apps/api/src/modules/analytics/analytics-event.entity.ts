import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Eveniment de analytics. Folosit ca sursă single source-of-truth internă.
 * Același eventId e trimis și către GA4/Pixel pentru dedup → permite cross-check.
 */
@Entity({ name: 'analytics_events' })
@Index(['type', 'createdAt'])
@Index(['sessionKey', 'createdAt'])
@Index(['siteId', 'createdAt'])
export class AnalyticsEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  /** ID stabil generat de client (UUIDv4). Folosit pentru dedup în GA/Pixel. */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  eventId!: string;

  /** Tip eveniment: page_view, click, scroll, generation_start, generation_complete, purchase_init, purchase_success, signup, login. */
  @Index()
  @Column({ type: 'varchar', length: 48 })
  type!: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  sessionKey!: string;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  visitorId!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  guestId!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  url!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  path!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  referrer!: string | null;

  /** Pentru evenimente de revenue (purchase_success): suma în cents (RON). */
  @Column({ type: 'integer', nullable: true })
  valueCents!: number | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  currency!: string | null;

  /** Props arbitrare (UTM, scroll depth, payment session id etc). */
  @Column({ type: 'jsonb', nullable: true })
  props!: Record<string, unknown> | null;

  /** Status forward către GA4 / Meta CAPI. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  forwardStatus!: 'pending' | 'sent' | 'failed' | 'skipped' | null;

  @Column({ type: 'text', nullable: true })
  forwardError!: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip!: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
