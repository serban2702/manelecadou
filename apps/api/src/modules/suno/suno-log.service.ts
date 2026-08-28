import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SunoLog, SunoLogOutcome } from './suno-log.entity';

export interface SunoLogStartInput {
  generationId: string | null;
  endpoint: string;
  requestBody: Record<string, unknown>;
  siteId?: string | null;
  requestType?: 'submit' | 'sample' | 'playground';
}

export interface SunoLogFinalizeInput {
  responseStatus?: number | null;
  responseBody?: unknown;
  taskId?: string | null;
  providerStatus?: string | null;
  outcome: SunoLogOutcome;
  errorMessage?: string | null;
  /** Override pentru numărul de credite consumate. Default: ia din config. */
  costCredits?: number;
}

/**
 * Wrapper subțire peste repo-ul SunoLog. Logarea NU trebuie să arunce niciodată
 * o excepție în pipeline-ul de generare — orice eroare de DB e log-ată local și
 * suprimată ca să nu rupă requestul.
 */
@Injectable()
export class SunoLogService {
  private readonly logger = new Logger('SunoLogService');

  constructor(
    @InjectRepository(SunoLog) private readonly repo: Repository<SunoLog>,
    private readonly config: ConfigService,
  ) {}

  /**
   * Cost implicit per cerere `generate` (sunoapi.org). Configurabil ca să poată
   * fi ajustat fără redeploy de cod.
   */
  defaultCostCredits(): number {
    const raw = this.config.get<string>('SUNO_CREDITS_PER_GENERATE');
    const n = raw ? Number(raw) : 10;
    return Number.isFinite(n) && n >= 0 ? n : 10;
  }

  async start(input: SunoLogStartInput): Promise<SunoLog | null> {
    try {
      const log = this.repo.create({
        generationId: input.generationId,
        endpoint: input.endpoint,
        requestType: input.requestType ?? 'submit',
        requestBody: input.requestBody,
        outcome: 'pending',
        costCredits: '0',
        siteId: input.siteId ?? null,
      });
      return await this.repo.save(log);
    } catch (err) {
      this.logger.warn(`SunoLog start failed: ${(err as Error).message}`);
      return null;
    }
  }

  async finalize(id: string | null | undefined, patch: SunoLogFinalizeInput): Promise<void> {
    if (!id) return;
    try {
      const cost =
        typeof patch.costCredits === 'number'
          ? patch.costCredits
          : patch.outcome === 'success'
            ? this.defaultCostCredits()
            : 0;
      // Cast `any` necesar fiindcă jsonb e tipat `unknown` în entity, iar
      // QueryDeepPartialEntity nu acceptă acel union direct.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.repo.update({ id }, {
        responseStatus: patch.responseStatus ?? null,
        responseBody: (patch.responseBody ?? null) as any,
        taskId: patch.taskId ?? null,
        providerStatus: patch.providerStatus ?? null,
        outcome: patch.outcome,
        errorMessage: patch.errorMessage ?? null,
        costCredits: cost.toFixed(2),
        completedAt: new Date(),
      });
    } catch (err) {
      this.logger.warn(`SunoLog finalize failed: ${(err as Error).message}`);
    }
  }
}
