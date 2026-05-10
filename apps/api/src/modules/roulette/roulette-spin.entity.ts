import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'roulette_spins' })
export class RouletteSpin {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  guestId!: string | null;

  /** Index 0-based al premiului în pool */
  @Column({ type: 'integer' })
  prizeIndex!: number;

  /** Etichetă/descriere premiu (snapshot) */
  @Column({ type: 'varchar', length: 200 })
  prizeLabel!: string;

  /** Cod promo generat (dacă a câștigat reducere) */
  @Column({ type: 'uuid', nullable: true })
  awardedPromoCodeId!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  awardedCode!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
