import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { MailService } from './mail.service';
import { ImapService } from './imap.service';
import { MailAccount } from './entities/mail-account.entity';
import {
  MAIL_APPEND_QUEUE,
  MailAppendJob,
  discardMime,
  pruneOutbox,
} from '../../mailer/mail-append.queue';
import { readMailFile } from '../../mailer/mail-storage';
import { StorageService } from '../../storage/storage.service';

/** Vechimea peste care un .eml rămas în outbox e considerat gunoi. */
const OUTBOX_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Copiază în folderul `Sent` al căsuței fiecare mail trimis de platformă —
 * de la magic link-uri până la răspunsurile scrise din admin. Efectul: ce a
 * plecat către client se vede și în webmail/telefon, nu doar în admin.
 *
 * Rulează separat de trimitere (coadă cu retry) tocmai ca un IMAP indisponibil
 * să nu întârzie și să nu rateze niciun mail către client.
 */
@Processor(MAIL_APPEND_QUEUE)
export class MailAppendProcessor extends WorkerHost {
  private readonly logger = new Logger('MailAppendProcessor');

  constructor(
    private readonly mail: MailService,
    private readonly imap: ImapService,
    private readonly storage: StorageService,
  ) {
    super();
  }

  async process(job: Job<MailAppendJob>): Promise<void> {
    const data = job.data;
    const acc = await this.resolveAccount(data);
    if (!acc) {
      // Site fără căsuță IMAP conectată (ex. un tenant nou) — nu e o eroare.
      this.logger.debug(`no mailbox for ${data.fromAddr}; skipping sent-copy`);
      await discardMime(this.storage, data.mimePath);
      return;
    }

    let raw: Buffer;
    try {
      // `mimePath` e cheia de storage (formatul nou) sau calea absolută veche —
      // helper-ul le acceptă pe amândouă și caută disc → uploads → R2.
      raw = await readMailFile(this.storage, data.mimePath);
    } catch (e) {
      // Fișierul a dispărut (prune sau job reluat după ștergere) — nu are rost retry.
      this.logger.warn(`mime missing for ${data.messageId}: ${(e as Error).message}`);
      return;
    }

    const folderPath = await this.resolveSentFolder(acc);
    if (!folderPath) {
      this.logger.warn(`no Sent folder for ${acc.email}; skipping sent-copy`);
      await discardMime(this.storage, data.mimePath);
      return;
    }

    try {
      const { appended } = await this.imap.appendToFolder(acc, folderPath, raw, data.messageId);
      this.logger.log(
        `${appended ? 'sent-copy' : 'sent-copy (already there)'} ${acc.email} → ${folderPath} to=${data.to} id=${data.messageId}`,
      );
      await discardMime(this.storage, data.mimePath);
      void pruneOutbox(this.storage, OUTBOX_MAX_AGE_MS);
    } catch (e) {
      const msg = (e as Error).message;
      // Ultima încercare: nu mai ține fișierul ocupat degeaba.
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        this.logger.warn(`sent-copy gave up for ${data.messageId}: ${msg}`);
        await discardMime(this.storage, data.mimePath);
        return;
      }
      throw e;
    }
  }

  /**
   * Găsește căsuța în care trebuie să apară copia. Cheia principală e adresa de
   * expeditor (mailul trebuie să apară în Sent-ul căsuței de pe care a plecat);
   * `siteId` e doar rezerva, pentru cazul în care from-ul e un alias.
   */
  private async resolveAccount(data: MailAppendJob): Promise<MailAccount | null> {
    const byAddr = await this.mail.accounts
      .createQueryBuilder('a')
      .where('LOWER(a.email) = LOWER(:email)', { email: data.fromAddr })
      .getOne();
    if (byAddr) return byAddr;
    if (!data.siteId) return null;
    return this.mail.accounts.findOne({ where: { siteId: data.siteId } });
  }

  /**
   * Calea folderului Sent. Preferă ce știm din sync; dacă nu s-a sincronizat
   * încă, întreabă serverul live (un cont nou nu are foldere în DB).
   */
  private async resolveSentFolder(acc: MailAccount): Promise<string | null> {
    const known = await this.mail.folders.findOne({ where: { accountId: acc.id, role: 'sent' } });
    if (known) return known.path;
    try {
      const remote = await this.imap.listFolders(acc);
      return remote.find((f) => f.role === 'sent')?.path ?? null;
    } catch (e) {
      this.logger.warn(`listFolders failed for ${acc.email}: ${(e as Error).message}`);
      return null;
    }
  }
}
