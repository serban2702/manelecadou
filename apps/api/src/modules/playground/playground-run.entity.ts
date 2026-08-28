import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type PlaygroundRunStatus =
  | 'queued'
  | 'writing_lyrics'
  | 'generating_audio'
  | 'succeeded'
  | 'failed';

export interface PlaygroundTrack {
  audioUrl: string;
  durationSec?: number;
  audioId?: string;
}

@Entity({ name: 'playground_runs' })
@Index(['siteId', 'createdAt'])
export class PlaygroundRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  siteId!: string;

  @Column({ type: 'varchar', length: 180, nullable: true })
  createdByEmail!: string | null;

  @Column({ type: 'varchar', length: 16 })
  engine!: 'suno' | 'google';

  @Column({ type: 'varchar', length: 32, default: 'queued' })
  status!: PlaygroundRunStatus;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'jsonb' })
  input!: Record<string, unknown>;

  /** Prompturile efectiv trimise (GPT / Suno / Lyria), pentru inspecție. */
  @Column({ type: 'jsonb', nullable: true })
  prompts!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  lyricsDraft!: string | null;

  @Column({ type: 'text', nullable: true })
  lyrics!: string | null;

  @Column({ type: 'text', nullable: true })
  lyricsPhonetic!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  tracks!: PlaygroundTrack[] | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  providerJobId!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  openaiModel!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  audioModel!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
