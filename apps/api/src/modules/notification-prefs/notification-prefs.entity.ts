import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ChatNotifyMode } from './notification-kind';

/**
 * Preferințele de notificări push ale unui admin.
 *
 * Un rând per admin, nu per device: dacă ai iPhone și Mac, ambele urmează
 * aceleași reguli. Un admin fără rând primește tot (vezi
 * DEFAULT_NOTIFICATION_PREFS) — lipsa rândului înseamnă „n-a ales încă", nu
 * „nu vrea nimic".
 */
@Entity({ name: 'admin_notification_prefs' })
export class AdminNotificationPrefs {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  userId!: string;

  /** Plată primită sau eșuată. */
  @Column({ type: 'boolean', default: true })
  payment!: boolean;

  /** Vizitatorul a ajuns pe ultimul pas al formularului (Plată). */
  @Column({ type: 'boolean', default: true })
  finalStep!: boolean;

  /** all | paid_only | off. Vezi ChatNotifyMode. */
  @Column({ type: 'varchar', length: 16, default: 'all' })
  chatMode!: ChatNotifyMode;

  /** Comandă finalizată sau generare eșuată. */
  @Column({ type: 'boolean', default: true })
  generation!: boolean;

  /** Plată fără livrare: generare sau modificare nepornită. Cere intervenție. */
  @Column({ type: 'boolean', default: true })
  stalledDelivery!: boolean;

  /** Alerte de la agentul AI (escaladări, cap de mesaje). */
  @Column({ type: 'boolean', default: true })
  aiAlert!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
