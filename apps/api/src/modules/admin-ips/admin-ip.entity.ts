import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * IP-uri de pe care s-a intrat în admin. Sesiunile de analytics venite de pe
 * ele sunt marcate `isInternal` și dispar din rapoarte.
 *
 * Se populează singur: orice request autentificat de admin își lasă IP-ul aici.
 *
 * ⚠️ Un admin care intră de pe date mobile aduce aici IP-ul operatorului, care
 * e partajat cu mii de clienți reali — de la momentul ăla, comenzile lor nu mai
 * apar în rapoarte. De-aia lista e vizibilă și editabilă în admin (`enabled`
 * false o scoate din calcul fără s-o șteargă), și de-aia păstrăm `lastSeenAt`:
 * un IP care nu mai apare de mult e primul candidat la curățare.
 */
@Entity({ name: 'admin_ips' })
export class AdminIp {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** IPv4 sau IPv6, exact cum îl vede API-ul după cele două hop-uri de proxy. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  ip!: string;

  /** Ultimul admin văzut pe IP-ul ăsta. Doar informativ. */
  @Column({ type: 'uuid', nullable: true })
  lastUserId!: string | null;

  /** Etichetă scrisă de om („birou", „acasă Daniel"). */
  @Column({ type: 'varchar', length: 120, nullable: true })
  label!: string | null;

  /** False = păstrat în listă, dar ignorat la marcarea sesiunilor. */
  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
