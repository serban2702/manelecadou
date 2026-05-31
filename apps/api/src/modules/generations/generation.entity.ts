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

  // ============== Model PACHETE (basic | plus | premium) ==============
  /** Tier-ul pachetului ales de client. Înlocuiește vechiul model premium/tip.
   *  Default 'basic' pentru rândurile vechi (synchronize-safe). */
  @Column({ type: 'varchar', length: 16, default: 'basic' })
  packageTier!: string;

  /** URL-urile celor 4 variante de imagine social-share generate (plus/premium). */
  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  socialImages!: string[];

  /** Imaginea socială aleasă/curentă (din socialImages sau upload propriu). */
  @Column({ type: 'varchar', length: 1024, nullable: true })
  socialImageSelected!: string | null;

  /** Imagine socială încărcată manual de client. */
  @Column({ type: 'varchar', length: 1024, nullable: true })
  socialImageUploaded!: string | null;

  /** URL track instrumental (plus/premium). */
  @Column({ type: 'varchar', length: 1024, nullable: true })
  instrumentalUrl!: string | null;

  /** URL videoclip generat (premium) — versiunea 1 (track 1). */
  @Column({ type: 'varchar', length: 1024, nullable: true })
  videoUrl!: string | null;

  /** URL videoclip pentru a 2-a versiune de melodie (track 2, premium). */
  @Column({ type: 'varchar', length: 1024, nullable: true })
  videoUrlBonus!: string | null;

  /**
   * true când TOATE livrabilele pachetului (instrumental/imagini) au fost
   * procesate (cu succes sau eșec). Melodia poate fi `succeeded` înainte ca
   * extras-urile să fie gata — frontend-ul face polling până aici devine true.
   * Default true: basic + generări legacy nu au extras de așteptat.
   */
  @Column({ type: 'boolean', default: true })
  deliverablesReady!: boolean;

  @Column({ type: 'varchar', length: 128, nullable: true })
  providerJobId!: string | null;

  // Tracks: array of { audioUrl, durationSec, isPaid }
  @Column({ type: 'jsonb', nullable: true })
  tracks!: Array<{ audioUrl: string; durationSec: number; coverUrl?: string; audioId?: string }> | null;

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

  /** Următoarea reîncercare automată plănuită pentru cazurile în care Suno e
   *  căzut. Setat când job-ul eșuează la o generation plătită (sau type='full').
   *  Worker-ul BullMQ are job-ul deja la coadă cu `delay`; câmpul ăsta e doar
   *  pentru afișare în admin („Auto-retry în 5 min"). NULL = nu mai retry-uim
   *  automat (success, refund, sau admin a încărcat manual). */
  @Column({ type: 'timestamptz', nullable: true })
  nextRetryAt!: Date | null;

  /** Timestamp-ul ultimei reîncercări automate (separate de manual `retry`).
   *  Folosit pentru afișare în admin + debug. */
  @Column({ type: 'timestamptz', nullable: true })
  lastRetryAt!: Date | null;

  /** ID-ul sesiunii OpenReplay (self-hosted) la momentul creării generation-ului.
   *  Populat automat din header X-OpenReplay-SessionID via TypeORM subscriber. */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  openReplaySessionId!: string | null;

  // ============== AI Sales Agent — fields completate de Irina virtuală ==============

  /** „De la" — cine semnează maneaua. Optional (Irina îl colectează separat de mesaj). */
  @Column({ type: 'varchar', length: 120, nullable: true })
  dedicatorName!: string | null;

  /** Sex destinatar (M/F) — folosit pentru inferarea automată a vocii când userul nu o alege explicit. */
  @Column({ type: 'varchar', length: 8, nullable: true })
  recipientGender!: 'M' | 'F' | null;

  /** Marker: această generation a fost creată de AI agent pe baza unui transcript de chat. */
  @Column({ type: 'boolean', default: false })
  inferredFromChat!: boolean;

  /** Audit ce a inferat AI și de unde (per câmp: 'user_said' | 'inferred' | 'default'). */
  @Column({ type: 'jsonb', nullable: true })
  inferenceMeta!: Record<string, { value: unknown; source: 'user_said' | 'inferred' | 'default' }> | null;

  /** Parolă (hash) setată de owner pentru a debloca conținutul PRIVAT al manelei
   *  (poze custom încărcate + colaje + image-videos) pentru alți vizitatori.
   *  NULL = niciun conținut privat partajat (doar owner-ul vede private). */
  @Column({ type: 'varchar', length: 128, nullable: true })
  unlockPasswordHash!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
