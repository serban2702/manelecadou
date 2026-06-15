import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type LyricsLogOutcome =
  | 'pending'         // request-ul a plecat, încă așteptăm răspunsul
  | 'success'         // OpenAI a returnat text valid
  | 'failed'          // OpenAI a aruncat eroare / non-2xx
  | 'mock_fallback';  // fără OPENAI_API_KEY sau eroare → s-a folosit mock-ul

export type LyricsLogStage = 'writer' | 'critic' | 'moderation' | 'phonetic';

/**
 * Loghează fiecare apel către OpenAI Chat Completions pentru generarea de
 * versuri (writer + critic). Persistăm request-ul complet (system+user prompt)
 * și răspunsul brut, plus tokens & durata, pentru audit și debug.
 *
 * Convenția e identică cu SunoLog: rândul se crează la start (outcome=pending)
 * și se update-ează la finalize cu outcome terminal.
 */
@Entity({ name: 'lyrics_logs' })
@Index(['createdAt'])
@Index(['siteId', 'createdAt'])
export class LyricsLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  generationId!: string | null;

  /** writer = ciornă inițială; critic = rafinare după draft;
   *  moderation = validare conținut (nume artiști etc.) înainte de plată;
   *  phonetic = rescriere „cum se aud" înainte de Suno. */
  @Index()
  @Column({ type: 'varchar', length: 32 })
  stage!: LyricsLogStage;

  /** Modelul OpenAI folosit (ex: gpt-4o-mini, gpt-4o). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  model!: string | null;

  /** Locale-ul țintă al versurilor (ro, bg, sr, tr, el, hr, sl, bs). */
  @Column({ type: 'varchar', length: 16, nullable: true })
  locale!: string | null;

  @Column({ type: 'text' })
  systemPrompt!: string;

  @Column({ type: 'text' })
  userPrompt!: string;

  /** Răspunsul brut JSON de la OpenAI (alegerile, usage, etc.). */
  @Column({ type: 'jsonb', nullable: true })
  responseBody!: unknown;

  /** Textul final extras (content-ul mesajului). */
  @Column({ type: 'text', nullable: true })
  responseContent!: string | null;

  @Column({ type: 'integer', nullable: true })
  responseStatus!: number | null;

  @Column({ type: 'integer', nullable: true })
  tokensPrompt!: number | null;

  @Column({ type: 'integer', nullable: true })
  tokensCompletion!: number | null;

  @Column({ type: 'integer', nullable: true })
  tokensTotal!: number | null;

  /** Durata apelului OpenAI în milisecunde. */
  @Column({ type: 'integer', nullable: true })
  durationMs!: number | null;

  @Index()
  @Column({ type: 'varchar', length: 32, default: 'pending' })
  outcome!: LyricsLogOutcome;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  completedAt!: Date | null;
}
