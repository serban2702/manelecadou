import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type CollageTrack = 'main' | 'bonus';
export type CollageStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

/**
 * Un job de „colaj video" creat on-demand de owner-ul unei manele finalizate.
 * Userul alege una dintre cele 2 melodii (main/bonus) și încarcă imagini;
 * worker-ul montează un video (1080x1920) în care imaginile se schimbă la 7s
 * cu tranziții, până se termină melodia.
 *
 * Schema e additivă (tabel nou) — safe pentru `synchronize: true`.
 */
@Entity({ name: 'video_collages' })
export class VideoCollage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Generation-ul sursă (de unde luăm audio-ul + recipientName + branding). */
  @Index()
  @Column({ type: 'uuid' })
  generationId!: string;

  /** Care din cele 2 melodii e folosită ('main' = full.mp3, 'bonus' = bonus.mp3). */
  @Column({ type: 'varchar', length: 8, default: 'main' })
  track!: CollageTrack;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: CollageStatus;

  /** URL public al videoclipului montat (`/uploads/collage/<id>/collage.mp4`). */
  @Column({ type: 'varchar', length: 1024, nullable: true })
  videoUrl!: string | null;

  /** Câte imagini a încărcat userul. */
  @Column({ type: 'integer', default: 0 })
  imageCount!: number;

  /** Emailul către care trimitem notificarea la final (owner user/guest). */
  @Column({ type: 'varchar', length: 320, nullable: true })
  email!: string | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
