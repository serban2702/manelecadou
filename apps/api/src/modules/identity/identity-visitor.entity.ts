import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'identity_visitors' })
@Index(['siteId', 'visitorId'], { unique: true })
@Index(['siteId', 'deviceKey', 'lastSeenAt'])
export class IdentityVisitor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  personId!: string;

  @Index()
  @Column({ type: 'uuid' })
  siteId!: string;

  @Column({ type: 'varchar', length: 64 })
  visitorId!: string;

  @Column({ type: 'varchar', length: 64 })
  deviceKey!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  guestId!: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  lastIp!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  userAgent!: string | null;

  @UpdateDateColumn()
  lastSeenAt!: Date;
}
