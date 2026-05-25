import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type GenerationType = 'demo' | 'full';
export type GenerationStatus =
  | 'pending'
  | 'queued'
  | 'writing_lyrics'
  | 'checking_lyrics'
  | 'generating_audio'
  | 'running'
  | 'succeeded'
  | 'failed';

@Entity({ name: 'generations' })
export class Generation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  ownerUserId!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  ownerGuestId!: string | null;

  @Column({ type: 'varchar', length: 16 })
  type!: GenerationType;

  @Column({ type: 'varchar', length: 24, default: 'pending' })
  status!: GenerationStatus;

  @Column({ type: 'integer', default: 30 })
  durationSec!: number;

  @Column({ type: 'varchar', length: 64 })
  style!: string;

  @Column({ type: 'varchar', length: 64 })
  occasion!: string;

  @Column({ type: 'varchar', length: 120 })
  recipientName!: string;

  @Column({ type: 'varchar', length: 600 })
  message!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  dedication!: string | null;

  @Column({ type: 'varchar', length: 64 })
  voiceArtist!: string;

  // Custom lyrics provided by user (overrides AI-written lyrics)
  @Column({ type: 'text', nullable: true })
  customLyrics!: string | null;

  // Drafts produced by the lyrics pipeline
  @Column({ type: 'text', nullable: true })
  lyricsDraft!: string | null;

  @Column({ type: 'text', nullable: true })
  lyrics!: string | null;

  // Tip / dedicație money the recipient gets in song (RON)
  @Column({ type: 'integer', default: 0 })
  tipAmount!: number;

  @Column({ type: 'boolean', default: false })
  premium!: boolean;

  @Column({ type: 'varchar', length: 128, nullable: true })
  providerJobId!: string | null;

  // Tracks: array of { audioUrl, durationSec, isPaid }
  @Column({ type: 'jsonb', nullable: true })
  tracks!: Array<{ audioUrl: string; durationSec: number; coverUrl?: string }> | null;

  /** URL-ul fișierului COMPLET, găzduit local (`/uploads/audio/<id>/full.mp3`).
   *  Expus în payload doar dacă userul are dreptul (paidUnlocked + owner). */
  @Column({ type: 'text', nullable: true })
  audioUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  bonusAudioUrl!: string | null;

  /** URL-ul fișierului DEMO (30s + fade-out). Singurul expus pentru
   *  neplătiți și pe paginile publice. Fișier separat fizic — fără full audio. */
  @Column({ type: 'text', nullable: true })
  demoAudioUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  demoBonusAudioUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  coverUrl!: string | null;

  @Column({ type: 'boolean', default: false })
  paidUnlocked!: boolean;

  @Column({ type: 'integer', default: 0 })
  viewCount!: number;

  @Column({ type: 'varchar', length: 5, default: 'ro' })
  locale!: string;

  @Column({ type: 'uuid', nullable: true })
  paymentId!: string | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ type: 'integer', default: 0 })
  retryCount!: number;

  /** ID-ul sesiunii OpenReplay (self-hosted) la momentul creării generation-ului.
   *  Populat automat din header X-OpenReplay-SessionID via TypeORM subscriber. */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  openReplaySessionId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
