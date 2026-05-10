import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorLog } from './error-log.entity';

@Injectable()
export class ErrorsService {
  private readonly logger = new Logger('ErrorsService');

  constructor(
    @InjectRepository(ErrorLog) private readonly repo: Repository<ErrorLog>,
  ) {}

  async log(input: {
    level?: 'error' | 'warn' | 'info';
    source?: 'api' | 'web' | 'admin';
    message: string;
    stack?: string;
    path?: string;
    method?: string;
    statusCode?: number;
    userId?: string;
    guestId?: string;
    ip?: string;
    userAgent?: string;
    meta?: Record<string, unknown>;
    siteId?: string | null;
  }): Promise<void> {
    try {
      await this.repo.save(
        this.repo.create({
          level: input.level ?? 'error',
          source: input.source ?? 'api',
          message: input.message.slice(0, 200),
          stack: input.stack ?? null,
          path: input.path ?? null,
          method: input.method ?? null,
          statusCode: input.statusCode ?? null,
          userId: input.userId ?? null,
          guestId: input.guestId ?? null,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          meta: input.meta ?? null,
          siteId: input.siteId ?? null,
        }),
      );
    } catch (err) {
      // Avoid infinite recursion if logging itself fails
      this.logger.error(`Failed to persist error log: ${(err as Error).message}`);
    }
  }

  /** Listare admin. siteId === null → cross-site (selector „Toate"). */
  async list(opts: {
    level?: 'error' | 'warn' | 'info';
    source?: 'api' | 'web' | 'admin';
    resolved?: boolean;
    limit?: number;
    siteId?: string | null;
  }): Promise<ErrorLog[]> {
    const qb = this.repo.createQueryBuilder('e');
    if (opts.level) qb.andWhere('e.level = :level', { level: opts.level });
    if (opts.source) qb.andWhere('e.source = :source', { source: opts.source });
    if (typeof opts.resolved === 'boolean') qb.andWhere('e.resolved = :r', { r: opts.resolved });
    if (opts.siteId) qb.andWhere('e."siteId" = :siteId', { siteId: opts.siteId });
    qb.orderBy('e.createdAt', 'DESC').take(Math.min(Math.max(opts.limit ?? 100, 1), 500));
    return qb.getMany();
  }

  async resolve(id: string): Promise<void> {
    await this.repo.update({ id }, { resolved: true });
  }

  async resolveAll(siteId: string | null): Promise<number> {
    const qb = this.repo
      .createQueryBuilder()
      .update(ErrorLog)
      .set({ resolved: true })
      .where('resolved = :r', { r: false });
    if (siteId) qb.andWhere('"siteId" = :siteId', { siteId });
    const res = await qb.execute();
    return res.affected ?? 0;
  }

  async clear(opts: { siteId: string | null; onlyResolved?: boolean }): Promise<number> {
    const qb = this.repo.createQueryBuilder().delete().from(ErrorLog);
    let hasWhere = false;
    if (opts.onlyResolved) {
      qb.where('resolved = :r', { r: true });
      hasWhere = true;
    }
    if (opts.siteId) {
      hasWhere ? qb.andWhere('"siteId" = :siteId', { siteId: opts.siteId })
               : qb.where('"siteId" = :siteId', { siteId: opts.siteId });
    }
    const res = await qb.execute();
    return res.affected ?? 0;
  }

  async stats(siteId: string | null) {
    const qb = this.repo
      .createQueryBuilder('e')
      .select('e.level', 'level')
      .addSelect('COUNT(*)', 'count')
      .where(`e.createdAt >= NOW() - INTERVAL '1 day'`);
    if (siteId) qb.andWhere('e."siteId" = :siteId', { siteId });
    const last24h = await qb.groupBy('e.level').getRawMany<{ level: string; count: string }>();
    const unresolved = await this.repo.count({
      where: siteId ? { resolved: false, siteId } : { resolved: false },
    });
    return {
      last24h: last24h.reduce<Record<string, number>>((acc, r) => {
        acc[r.level] = Number(r.count);
        return acc;
      }, {}),
      unresolved,
    };
  }
}
