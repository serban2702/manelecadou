import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { AI_REPLY_QUEUE } from './mail-sync.service';
import { AiReplyService } from './ai-reply.service';

@Processor(AI_REPLY_QUEUE)
export class AiReplyProcessor extends WorkerHost {
  private readonly logger = new Logger('AiReplyProcessor');

  constructor(private readonly svc: AiReplyService) {
    super();
  }

  async process(job: Job<{ messageId: string }>): Promise<void> {
    if (job.name !== 'suggest') return;
    const { messageId } = job.data;
    try {
      await this.svc.suggestFor(messageId);
    } catch (e) {
      this.logger.warn(`suggest failed msg=${messageId}: ${(e as Error).message}`);
      throw e;
    }
  }
}
