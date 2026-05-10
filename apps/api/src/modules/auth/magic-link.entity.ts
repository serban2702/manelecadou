import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'magic_links' })
export class MagicLink {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  tokenHash!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'uuid', nullable: true })
  guestIdAtRequest!: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
