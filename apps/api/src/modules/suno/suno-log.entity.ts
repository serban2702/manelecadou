import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type SunoLogOutcome =
  | 'pending'      // submit-ul a plecat, încă așteptăm rezultatul
  | 'success'      // generarea audio a reușit
  | 'failed'       // Suno a întors un cod de eșec terminal
  | 'http_error'   // submit-ul a primit HTTP non-2xx
  | 'timeout';     // polling-ul a expirat

/**
 * Loghează fiecare apel de submit către Suno (sunoapi.org).
 * Polling-ul nu costă credite, deci nu îl logăm separat — doar finalul terminal
 * este înregistrat ca update pe rândul existent (`responseStatus`, `outcome`,
 * `errorMessage`, `costCredits`, `completedAt`).
 */
@Entity({ name: 'suno_logs' })
@Index(['createdAt'])
@Index(['siteId', 'createdAt'])
export class SunoLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  generationId!: string | null;

  /**
   * Tipul de cerere:
   *   - 'submit'     — generare normală (manea pentru user)
   *   - 'sample'     — mostră audio scurtă pentru cardul de stil/voce din /studio
   *                    (generată din admin, NU apare în galerie publică)
   *   - 'playground' — generare din admin playground (fără comandă de client)
   */
  @Column({ type: 'varchar', length: 32, default: 'submit' })
  requestType!: 'submit' | 'sample' | 'playground';

  @Column({ type: 'varchar', length: 256 })
  endpoint!: string;

  @Column({ type: 'jsonb' })
  requestBody!: Record<string, unknown>;

  @Column({ type: 'integer', nullable: true })
  responseStatus!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  responseBody!: unknown;

  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  taskId!: string | null;

  /** Statusul terminal raportat de Suno (ex: SUCCESS, GENERATE_AUDIO_FAILED). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  providerStatus!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 32, default: 'pending' })
  outcome!: SunoLogOutcome;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  /**
   * Estimare credite consumate de această cerere. Per documentația sunoapi.org,
   * o cerere `generate` în modelul V4_5 = ~10 credits. Configurabil prin env
   * `SUNO_CREDITS_PER_GENERATE` (default 10). Dacă cererea eșuează (HTTP error
   * sau status terminal de eroare), setăm 0 — Suno în general nu taxează.
   */
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  costCredits!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  completedAt!: Date | null;
}
