import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'identity_persons' })
export class IdentityPerson {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  siteId!: string;

  @Column({ type: 'varchar', length: 32, default: 'classic' })
  experienceSlug!: string;

  @Index()
  @Column({ type: 'varchar', length: 320, nullable: true })
  email!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  lastSeenAt!: Date;
}
