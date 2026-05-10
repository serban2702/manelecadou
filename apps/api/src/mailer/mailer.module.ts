import { Injectable, Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailProvider, SendMailOptions, SendMailResult } from './mail.types';
import { SmtpMailProvider } from './providers/smtp.provider';
import { MailgunMailProvider } from './providers/mailgun.provider';
import { SettingsService } from '../modules/settings/settings.service';

@Injectable()
export class MailerService {
  private readonly logger = new Logger('MailerService');

  constructor(
    private readonly smtp: SmtpMailProvider,
    private readonly mailgun: MailgunMailProvider,
    private readonly settings: SettingsService,
  ) {}

  private async pickProvider(): Promise<MailProvider> {
    const which = ((await this.settings.get('MAIL_PROVIDER')) || 'smtp').toLowerCase();
    return which === 'mailgun' ? this.mailgun : this.smtp;
  }

  /** Mod compatibil cu codul existent — întoarce un obiect simplu cu flag dev. */
  async send(opts: SendMailOptions): Promise<{ devLogged?: boolean; messageId?: string; provider: string }> {
    const result = await this.sendDetailed(opts);
    return {
      devLogged: !result.sent,
      messageId: result.messageId,
      provider: result.provider,
    };
  }

  /** Trimite și întoarce rezultatul detaliat al provider-ului. */
  async sendDetailed(opts: SendMailOptions): Promise<SendMailResult> {
    const provider = await this.pickProvider();
    try {
      const result = await provider.send(opts);
      if (result.sent) {
        this.logger.log(`mail sent via ${result.provider} to=${opts.to} id=${result.messageId ?? '-'}`);
      } else {
        this.logger.warn(`mail not sent (${result.notes ?? 'unknown'}) to=${opts.to}`);
      }
      return result;
    } catch (err) {
      this.logger.error(`mail provider ${provider.name} failed: ${(err as Error).message}`);
      throw err;
    }
  }

  /** Numele provider-ului activ — util pentru debugging / admin. */
  async providerName(): Promise<string> {
    return (await this.pickProvider()).name;
  }
}

@Module({
  imports: [ConfigModule],
  providers: [SmtpMailProvider, MailgunMailProvider, MailerService],
  exports: [MailerService],
})
export class MailerModule {}
