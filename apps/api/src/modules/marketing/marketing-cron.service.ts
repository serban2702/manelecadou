import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SettingsService } from '../settings/settings.service';
import { MarketingService } from './marketing.service';

@Injectable()
export class MarketingCronService {
  private readonly logger = new Logger('MarketingCron');

  constructor(
    private readonly marketing: MarketingService,
    private readonly settings: SettingsService,
  ) {}

  /** Nightly la 09:00 UTC — rulează toate regulile active de drip. */
  @Cron('0 9 * * *', { name: 'marketing-rules', timeZone: 'UTC' })
  async runNightly(): Promise<void> {
    const enabled = (await this.settings.get('MARKETING_AUTOMATION_ENABLED')).toLowerCase();
    if (enabled !== 'true' && enabled !== '1') {
      this.logger.log('skip — MARKETING_AUTOMATION_ENABLED not enabled');
      return;
    }
    await this.runAllActive();
  }

  /** Rulează toate regulile active. Apelabil și manual din admin. */
  async runAllActive(): Promise<{ rules: number; totalSent: number }> {
    const maxPerRun = Number(await this.settings.get('MARKETING_RULE_MAX_PER_RUN')) || 200;
    const rules = await this.marketing.activeRules();
    let totalSent = 0;
    for (const rule of rules) {
      try {
        const res = await this.marketing.runRule(rule.id, maxPerRun);
        totalSent += res.sent;
        this.logger.log(`rule „${rule.name}" sent=${res.sent} eligible=${res.eligible}`);
      } catch (e) {
        this.logger.warn(`rule ${rule.id} failed: ${(e as Error).message}`);
      }
    }
    return { rules: rules.length, totalSent };
  }
}
