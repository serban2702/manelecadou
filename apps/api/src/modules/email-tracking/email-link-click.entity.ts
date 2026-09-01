import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Un click (sau o deschidere) pe un link dintr-un email.
 *
 * Un rând per apăsare, nu per link — de aici ies „de câte ori" și „când".
 * Rândurile de tip `open` vin din pixelul de urmărire și sunt marcate separat:
 * Gmail preîncarcă imaginile prin proxy-ul lui, deci o „deschidere" nu e o
 * dovadă că mailul a fost citit de om, în timp ce un click este.
 */
@Entity({ name: 'email_link_clicks' })
@Index(['siteId', 'clickedAt'])
@Index(['kind', 'clickedAt'])
export class EmailLinkClick {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  linkId!: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  token!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  kind!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  campaign!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  linkKey!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 320, nullable: true })
  recipientEmail!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  /** `click` (redirect) sau `open` (pixel). */
  @Index()
  @Column({ type: 'varchar', length: 8, default: 'click' })
  eventType!: 'click' | 'open';

  /** A câta apăsare e asta pentru linkul respectiv (1 = prima). */
  @Column({ type: 'integer', default: 1 })
  sequence!: number;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip!: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  device!: string | null;

  @Column({ type: 'varchar', length: 4, nullable: true })
  country!: string | null;

  /** Robotul de securitate al furnizorului de email (scanează linkurile înainte
   *  să le vadă omul). Marcat, nu șters: fără flag, un scaner care apasă toate
   *  linkurile ar face să pară că fiecare campanie are 100% rată de click. */
  @Index()
  @Column({ type: 'boolean', default: false })
  isBot!: boolean;

  @CreateDateColumn()
  clickedAt!: Date;
}
