import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SettingKind = 'string' | 'number' | 'bool' | 'secret' | 'select' | 'longtext';

@Entity({ name: 'app_settings' })
@Index('idx_app_settings_site_key', ['siteId', 'key'], { unique: true })
export class AppSetting {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** NULL = setare globală (toate site-urile). UUID = override per-site. */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 120 })
  key!: string;

  /** Stocat criptat dacă `encrypted=true`. */
  @Column({ type: 'text', default: '' })
  value!: string;

  @Column({ type: 'boolean', default: false })
  encrypted!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
