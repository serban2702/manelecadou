import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type GenerationType = 'demo' | 'full';

/** Fișiere derivate atașate unei generări (din uneltele Suno admin). Stocate
 *  în coloana `mediaExtras` (jsonb). Toate URL-urile sunt găzduite local
 *  (`/uploads/audio/<id>/...`) sau, ca fallback, URL-uri Suno temporare. */
export interface GenerationMediaExtras {
  /** WAV studio pentru piesa principală / bonus (Suno /wav/generate). */
  wavUrl?: string;
  wavBonusUrl?: string;
  /** Voce izolată + acompaniament (Suno /vocal-removal, type=separate_vocal). */
  vocalUrl?: string;
  accompanimentUrl?: string;
  /** Stem-uri individuale (type=split_stem): { drums, bass, guitar, ... }. */
  stems?: Record<string, string>;
  /** Videoclip MP4 generat de Suno (/mp4/generate) — principal / bonus. */
  musicVideoUrl?: string;
  musicVideoBonusUrl?: string;
}
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

  @Column({ type: 'text' })
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

  /** Câte reîncercări MANUALE (buton user „Reîncearcă") s-au făcut. Limită 3.
   *  Separat de `autoRetryCount` ca auto-retry-urile (Suno căzut / fără credite)
   *  să NU blocheze butonul manual — vezi GenerationsService.retry(). */
  @Column({ type: 'integer', default: 0 })
  retryCount!: number;

  /** Câte reîncercări AUTOMATE (backoff când Suno e căzut / fără credite) s-au
   *  făcut. Limită ~50. Incrementat de processor, NU de butonul manual. Resetat
   *  la 0 când userul declanșează un retry manual (îi dă auto-retry-ului o șansă
   *  nouă după ce s-au reîncărcat creditele). */
  @Column({ type: 'integer', default: 0 })
  autoRetryCount!: number;

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

  /** Momentul în care refacerea GRATUITĂ (o singură dată, când greșeala e a noastră)
   *  a fost consumată pe această comandă. NULL = încă disponibilă. */
  @Column({ type: 'timestamptz', nullable: true })
  freeRemakeUsedAt!: Date | null;

  /** Parolă (hash) setată de owner pentru a debloca conținutul PRIVAT al manelei
   *  (poze custom încărcate + colaje + image-videos) pentru alți vizitatori.
   *  NULL = niciun conținut privat partajat (doar owner-ul vede private). */
  @Column({ type: 'varchar', length: 128, nullable: true })
  unlockPasswordHash!: string | null;

  /** Parola în CLAR (cod de partajare 4 cifre, NU credențială) — vizibilă DOAR
   *  owner-ului în payload, ca s-o poată partaja. Public nu o primește niciodată. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  unlockPin!: string | null;

  // ============== Variații + unelte Suno admin ==============

  /** Dacă această generare este o VARIAȚIE (re-roll / regenerare / extend / cover)
   *  produsă din admin pentru o comandă existentă, aici e id-ul comenzii-părinte.
   *  NULL = generare normală/independentă. Variațiile nu apar în galeria publică
   *  și nu se livrează clientului până nu sunt promovate (principală/bonus). */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  parentGenerationId!: string | null;

  /** Etichetă scurtă pentru variație, afișată în admin (ex. „Re-roll",
   *  „Extend +30s", „Cover modern", „Versuri editate"). */
  @Column({ type: 'varchar', length: 80, nullable: true })
  variationLabel!: string | null;

  /** Ordinea manuală a variațiilor în admin (Studio). 0 = neordonată (cele
   *  noi apar primele); reordonarea atribuie 1..N în ordinea dorită. */
  @Column({ type: 'integer', default: 0 })
  sortOrder!: number;

  /** Fișiere derivate (WAV, karaoke/stems, videoclip) generate cu uneltele Suno. */
  @Column({ type: 'jsonb', nullable: true })
  mediaExtras!: GenerationMediaExtras | null;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
