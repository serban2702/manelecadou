import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';

import { MailService } from './mail.service';
import { MailSyncService, IMAP_SYNC_QUEUE } from './mail-sync.service';

const POLL_INTERVAL_MS = Number(process.env.MAIL_POLL_INTERVAL_MS ?? 60_000);

@Processor(IMAP_SYNC_QUEUE)
export class ImapSyncProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger('ImapSyncProcessor');

  constructor(
    private readonly mail: MailService,
    private readonly sync: MailSyncService,
    @InjectQueue(IMAP_SYNC_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    // Schedule a tick job every POLL_INTERVAL_MS that fan-outs to all sync-enabled accounts.
    await this.queue.add(
      'tick',
      {},
      { repeat: { every: POLL_INTERVAL_MS }, removeOnComplete: 50, removeOnFail: 50 },
    );
    // Trigger one immediate run on boot.
    await this.queue.add('tick', { boot: true }, { removeOnComplete: 5, removeOnFail: 5 });
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'tick') {
      // Cron-ul global iterează prin toate site-urile — fiecare cont aparține unui site
      // (acc.siteId), iar mesajele ingestate vor fi automat scoped pe siteId-ul contului.
      const accounts = await this.mail.listActiveAccountsForSync();
      for (const acc of accounts) {
        await this.queue.add('sync-account', { accountId: acc.id }, { removeOnComplete: 100, removeOnFail: 50 });
      }
      return;
    }
    if (job.name === 'sync-account') {
      const { accountId } = job.data as { accountId: string };
      try {
        const r = await this.sync.syncAccount(accountId);
        if (r.ingested > 0) this.logger.log(`account=${accountId} ingested=${r.ingested}`);
      } catch (e) {
        this.logger.warn(`sync-account ${accountId} failed: ${(e as Error).message}`);
        throw e;
      }
      return;
    }
  }
}
