import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SettingsService } from '../settings/settings.service';
import { RecoveryService } from './recovery.service';

@Injectable()
export class RecoveryCronService {
  private readonly logger = new Logger('RecoveryCron');
  /** Guard anti-suprapunere: o rulare lentă (multe sends) nu trebuie dublată. */
  private running = false;

  constructor(
    private readonly recovery: RecoveryService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * La fiecare 10 minute: upsert candidați + trimitere etape scadente.
   * Default ENABLED — rulează când `RECOVERY_EMAIL_ENABLED` e gol/'true'/'1';
   * se oprește DOAR pe 'false'/'0'.
   */
  @Cron('*/10 * * * *', { name: 'recovery-emails', timeZone: 'UTC' })
  async tick(): Promise<void> {
    const enabled = (await this.settings.get('RECOVERY_EMAIL_ENABLED')).trim().toLowerCase();
    if (enabled === 'false' || enabled === '0') return;
    await this.runOnce();
  }

  /** Rulează un ciclu complet (apelabil și manual, ex. la debugging). */
  async runOnce(): Promise<{ scanned: number; upserted: number; sent: number; converted: number; errors: number } | null> {
    if (this.running) {
      this.logger.warn('skip — rularea precedentă încă în curs');
      return null;
    }
    this.running = true;
    try {
      const refresh = await this.recovery.refreshCandidates();
      const due = await this.recovery.processDue();
      if (refresh.upserted > 0 || due.sent > 0 || due.converted > 0 || due.errors > 0) {
        this.logger.log(
          `scanned=${refresh.scanned} upserted=${refresh.upserted} sent=${due.sent} converted=${due.converted} errors=${due.errors}`,
        );
      }
      return { ...refresh, sent: due.sent, converted: due.converted, errors: due.errors };
    } catch (e) {
      this.logger.error(`recovery run failed: ${(e as Error).message}`);
      return null;
    } finally {
      this.running = false;
    }
  }
}
