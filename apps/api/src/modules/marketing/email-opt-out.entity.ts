import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Email dezabonat de la mailurile de MARKETING, per (site, email).
 *
 * Afectează DOAR mailurile de marketing (campanii + reguli drip). Mailurile
 * tranzacționale (plată confirmată, manea gata, magic-link, cod cadou) se trimit
 * ÎNTOTDEAUNA, indiferent de opt-out — nu trec prin lista asta.
 */
@Entity({ name: 'email_opt_outs' })
@Index('idx_email_opt_out_site_email', ['siteId', 'email'], { unique: true })
export class EmailOptOut {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  /** Lowercased. */
  @Column({ type: 'varchar', length: 320 })
  email!: string;

  /** De unde a venit dezabonarea (link mail, admin etc.). */
  @Column({ type: 'varchar', length: 32, default: 'link' })
  source!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
