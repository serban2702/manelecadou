import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Web Push Subscription per device per admin.
 * Un admin poate avea N device-uri subscribed (Mac, iPhone, Android).
 * Endpoint-ul e unic global (Push Service îl emite per device).
 */
@Entity({ name: 'web_push_subscriptions' })
export class WebPushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  /** Endpoint URL emis de push service (FCM/Mozilla/Apple). Unic global. */
  @Index({ unique: true })
  @Column({ type: 'text' })
  endpoint!: string;

  @Column({ type: 'text' })
  p256dh!: string;

  @Column({ type: 'text' })
  auth!: string;

  @Column({ type: 'text', nullable: true })
  userAgent!: string | null;

  /** Etichetă human-readable (ex. „MacBook · Chrome"). */
  @Column({ type: 'varchar', length: 120, nullable: true })
  label!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  /** Ultima dată când push-ul a fost trimis cu succes. Null = nu am încercat încă. */
  @Column({ type: 'timestamptz', nullable: true })
  lastSuccessAt!: Date | null;

  /** Numărul de erori consecutive. La >=3 cu cod 410/404, ștergem subscription-ul. */
  @Column({ type: 'integer', default: 0 })
  failureCount!: number;
}
