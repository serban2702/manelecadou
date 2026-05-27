import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Categorii predefinite pentru demo-urile manelelor curate (afișate pe /asculta
 * și în popup-ul de pe homepage). Folosite ca filtru și pentru i18n labels.
 */
export type SiteDemoCategory =
  | 'aniversare'
  | 'nunta'
  | 'botez'
  | 'cumetrie'
  | 'dragoste'
  | 'prietenie'
  | 'comemorare'
  | 'altele';

export const SITE_DEMO_CATEGORIES: SiteDemoCategory[] = [
  'aniversare',
  'nunta',
  'botez',
  'cumetrie',
  'dragoste',
  'prietenie',
  'comemorare',
  'altele',
];

/**
 * Demo-uri pre-încărcate de admin per site (NU cross-tenant). Afișate ca
 * exemple de manele „bine sunătoare" — distincte de generațiile reale ale
 * userilor, care merg pe /istoric. Vezi CLAUDE.md §16 — adăugarea tabelei e
 * additive (CREATE TABLE), safe pentru `synchronize: true`.
 */
@Entity({ name: 'site_demos' })
@Index(['siteId', 'active'])
@Index(['siteId', 'featuredOnHome'])
export class SiteDemo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Tenant owner — fiecare demo aparține unui singur site. NOT NULL by design. */
  @Index()
  @Column({ type: 'uuid' })
  siteId!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  /** „de la {fromName} pentru {toName}" — afișat sub titlu. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  fromName!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  toName!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'altele' })
  category!: SiteDemoCategory;

  /** Versuri afișate sub player, opțional. */
  @Column({ type: 'text', nullable: true })
  lyrics!: string | null;

  /** URL relativ servit de API: `/uploads/demos/<demoId>/full.mp3`. */
  @Column({ type: 'varchar', length: 500 })
  audioUrl!: string;

  @Column({ type: 'integer', nullable: true })
  audioDurationSec!: number | null;

  /** Secunda de la care pornește preview-ul în popup-ul homepage. */
  @Column({ type: 'integer', default: 0 })
  previewStartSec!: number;

  /** Cover/thumbnail (PNG/JPEG), opțional. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  thumbnailUrl!: string | null;

  @Column({ type: 'integer', default: 0 })
  sortOrder!: number;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  /** Doar cele bifate apar în popup-ul de pe homepage (max 5 servite). */
  @Column({ type: 'boolean', default: false })
  featuredOnHome!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
