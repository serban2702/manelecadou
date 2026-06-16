import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Starea (singleton — un singur rând) a monitorului de credite Suno.
 *
 * Cron-ul `SunoCreditMonitorService` rulează în fiecare minut, citește soldul de
 * credite (GET /api/v1/generate/credit) și decide dacă trimite o alertă pe Wingo.
 * Acest rând ține minte ce s-a alertat deja, ca să NU spam-uim:
 *
 *  - credite scăzute: alertăm O SINGURĂ DATĂ la intrarea sub prag, apoi DOAR
 *    când suma scade și mai mult (`lowAlertCredits` = ultima sumă alertată).
 *    Revenirea peste prag resetează starea (lowAlertActive=false) — o viitoare
 *    scădere re-alertează.
 *  - API căzut: alertăm o singură dată după `FAILS_BEFORE_DOWN` eșecuri
 *    consecutive; revenirea trimite un mesaj de „revenit" și resetează.
 */
@Entity({ name: 'suno_credit_monitor_state' })
export class SunoCreditMonitorState {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Ultimul sold citit cu succes (null dacă n-am citit niciodată cu succes). */
  @Column({ type: 'double precision', nullable: true })
  lastCredits!: number | null;

  /** Ultima verificare (succes sau eșec). */
  @Column({ type: 'timestamptz', nullable: true })
  lastCheckedAt!: Date | null;

  /** Ultima citire reușită (răspuns valid de la Suno). */
  @Column({ type: 'timestamptz', nullable: true })
  lastOkAt!: Date | null;

  // ── Alertă „credite scăzute" ──────────────────────────────────────────
  @Column({ type: 'boolean', default: false })
  lowAlertActive!: boolean;

  /** Suma la care s-a trimis ultima alertă de credite scăzute. */
  @Column({ type: 'double precision', nullable: true })
  lowAlertCredits!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  lowAlertAt!: Date | null;

  // ── Alertă „API căzut" ────────────────────────────────────────────────
  @Column({ type: 'boolean', default: false })
  apiDown!: boolean;

  /** Eșecuri consecutive (reset la prima citire reușită). */
  @Column({ type: 'int', default: 0 })
  consecutiveFailures!: number;

  @Column({ type: 'timestamptz', nullable: true })
  apiDownSince!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  apiDownAlertAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
