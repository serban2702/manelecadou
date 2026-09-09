import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AnalyticsSession } from '../analytics/analytics-session.entity';
import { AdminIpsService } from './admin-ips.service';

@Injectable()
export class InternalTrafficService {
  private readonly logger = new Logger('InternalTraffic');

  constructor(
    @InjectRepository(AnalyticsSession)
    private readonly sessions: Repository<AnalyticsSession>,
    private readonly adminIps: AdminIpsService,
  ) {}

  /**
   * Câte sesiuni ar fi marcate ca interne de un backfill.
   *
   * Există ca să poți vedea dimensiunea înainte să schimbi istoricul: dacă
   * numărul e mult mai mare decât te aștepți, cel mai probabil un IP de operator
   * mobil a intrat în listă și înghite clienți reali.
   */
  async previewBackfill(): Promise<{ ips: number; sessions: number }> {
    const ips = await this.adminIps.enabledIps();
    if (ips.length === 0) return { ips: 0, sessions: 0 };
    const sessions = await this.sessions.count({
      where: { ip: In(ips), isInternal: false },
    });
    return { ips: ips.length, sessions };
  }

  /** Marchează retroactiv sesiunile de pe IP-urile active. */
  async backfill(): Promise<{ ips: number; updated: number }> {
    const ips = await this.adminIps.enabledIps();
    if (ips.length === 0) return { ips: 0, updated: 0 };
    const res = await this.sessions
      .createQueryBuilder()
      .update(AnalyticsSession)
      .set({ isInternal: true })
      .where('ip IN (:...ips)', { ips })
      .andWhere('"isInternal" = false')
      .execute();
    const updated = res.affected ?? 0;
    this.logger.log(`backfill: ${updated} sesiuni marcate ca interne (${ips.length} IP-uri)`);
    return { ips: ips.length, updated };
  }
}
