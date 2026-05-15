import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LyricsLog, LyricsLogOutcome, LyricsLogStage } from './lyrics-log.entity';

export interface LyricsLogStartInput {
  stage: LyricsLogStage;
  systemPrompt: string;
  userPrompt: string;
  model?: string | null;
  locale?: string | null;
  siteId?: string | null;
  generationId?: string | null;
}

export interface LyricsLogFinalizeInput {
  outcome: LyricsLogOutcome;
  responseStatus?: number | null;
  responseBody?: unknown;
  responseContent?: string | null;
  tokensPrompt?: number | null;
  tokensCompletion?: number | null;
  tokensTotal?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
}

/**
 * Wrapper subțire peste repo-ul LyricsLog. Logarea NU trebuie să arunce
 * niciodată o excepție în pipeline-ul de generare a versurilor — orice
 * eroare de DB e log-ată local și suprimată ca să nu rupă requestul.
 */
@Injectable()
export class LyricsLogService {
  private readonly logger = new Logger('LyricsLogService');

  constructor(
    @InjectRepository(LyricsLog) private readonly repo: Repository<LyricsLog>,
  ) {}

  async start(input: LyricsLogStartInput): Promise<LyricsLog | null> {
    try {
      const log = this.repo.create({
        stage: input.stage,
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        model: input.model ?? null,
        locale: input.locale ?? null,
        siteId: input.siteId ?? null,
        generationId: input.generationId ?? null,
        outcome: 'pending',
      });
      return await this.repo.save(log);
    } catch (err) {
      this.logger.warn(`LyricsLog start failed: ${(err as Error).message}`);
      return null;
    }
  }

  async finalize(
    id: string | null | undefined,
    patch: LyricsLogFinalizeInput,
  ): Promise<void> {
    if (!id) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.repo.update({ id }, {
        outcome: patch.outcome,
        responseStatus: patch.responseStatus ?? null,
        responseBody: (patch.responseBody ?? null) as any,
        responseContent: patch.responseContent ?? null,
        tokensPrompt: patch.tokensPrompt ?? null,
        tokensCompletion: patch.tokensCompletion ?? null,
        tokensTotal: patch.tokensTotal ?? null,
        durationMs: patch.durationMs ?? null,
        errorMessage: patch.errorMessage ?? null,
        completedAt: new Date(),
      });
    } catch (err) {
      this.logger.warn(`LyricsLog finalize failed: ${(err as Error).message}`);
    }
  }
}
