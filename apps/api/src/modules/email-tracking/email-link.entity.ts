import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Un link urmărit dintr-un email trimis de platformă.
 *
 * Se creează câte un rând per (mail trimis × link din el), la momentul
 * trimiterii. Tokenul ajunge în URL ca `/api/e/c/<token>`; la click, redirectul
 * incrementează contoarele de aici și scrie un rând în `email_link_clicks`.
 *
 * De ce un tabel și nu un token semnat: contoarele („de câte ori a apăsat")
 * trebuie să existe undeva, iar un token semnat care poartă emailul,
 * destinația și campania ar fi făcut URL-uri de 400 de caractere pe care unele
 * clienți de mail le rup în două rânduri.
 */
@Entity({ name: 'email_links' })
@Index(['siteId', 'createdAt'])
@Index(['kind', 'createdAt'])
export class EmailLink {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Tokenul public din URL. 22 de caractere hex — scurt, dar neghicibil. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  token!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  /** Rândul din `outbound_emails` care a purtat linkul. */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  outboundEmailId!: string | null;

  /** Categoria mailului: recovery, marketing_campaign, marketing_rule, … */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  kind!: string | null;

  /** Campania logică (`utm_campaign` pus pe link): recovery-h24, camp-<id>, … */
  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  campaign!: string | null;

  /** Ce link din email: cta, logo, song, footer, link-2… (`utm_content`). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  linkKey!: string | null;

  /** Destinatarul. Aici stă răspunsul la „cine a apăsat". */
  @Index()
  @Column({ type: 'varchar', length: 320, nullable: true })
  recipientEmail!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  /** Entitatea sursă (recoveryStateId, campaignId, ruleId…). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  relatedId!: string | null;

  /** URL-ul final, cu UTM-urile deja aplicate. */
  @Column({ type: 'text' })
  targetUrl!: string;

  @Column({ type: 'integer', default: 0 })
  clickCount!: number;

  @Column({ type: 'timestamptz', nullable: true })
  firstClickAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastClickAt!: Date | null;

  /** Prima deschidere a mailului (pixel). Un singur rând per mail o poartă. */
  @Column({ type: 'boolean', default: false })
  isOpenPixel!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
