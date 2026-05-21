import { Injectable, Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailProvider, ResolvedMailContext, SendMailOptions, SendMailResult } from './mail.types';
import { SmtpMailProvider } from './providers/smtp.provider';
import { MailgunMailProvider } from './providers/mailgun.provider';
import { SettingsService } from '../modules/settings/settings.service';
import type { Site, SiteMailConfig } from '../modules/sites/site.entity';
import { decryptSecret } from '../common/crypto.util';

export type MailSiteRef = Site | { id?: string; slug?: string; mailConfig?: SiteMailConfig; fromEmail?: string | null; supportEmail?: string | null } | null | undefined;

/**
 * Extra context care poate fi trimis la send() ca să rezolve providerul + credențialele.
 * Dacă `site` are mailConfig.provider setat, folosim configul lui. Altfel cădem
 * pe configul global din SettingsService (env / db settings).
 */
export interface SendMailExtra {
  /** Site-ul curent (cu mailConfig). Decriptarea secretelor are loc aici. */
  site?: MailSiteRef;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger('MailerService');

  constructor(
    private readonly smtp: SmtpMailProvider,
    private readonly mailgun: MailgunMailProvider,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Rezolvă configul de mail: dacă site-ul are mailConfig.provider, folosim
   * configul per-tenant (cu decriptare); altfel cădem pe configul global.
   */
  private async resolveContext(site?: MailSiteRef): Promise<{ provider: MailProvider; ctx: ResolvedMailContext }> {
    const mc = site?.mailConfig;
    if (mc?.provider) {
      const ctx: ResolvedMailContext = {
        source: 'site',
        siteSlug: site?.slug,
        fromEmail: mc.fromEmail || site?.fromEmail || undefined,
        fromName: mc.fromName || undefined,
        replyTo: mc.replyTo || undefined,
      };
      if (mc.provider === 'mailgun') {
        ctx.mailgun = {
          apiKey: safeDecrypt(mc.mailgun?.apiKey),
          domain: mc.mailgun?.domain,
          region: mc.mailgun?.region,
          apiUrl: mc.mailgun?.apiUrl,
        };
        return { provider: this.mailgun, ctx };
      }
      if (mc.provider === 'smtp') {
        ctx.smtp = {
          host: mc.smtp?.host,
          port: mc.smtp?.port,
          secure: mc.smtp?.secure,
          user: mc.smtp?.user,
          pass: safeDecrypt(mc.smtp?.pass),
        };
        return { provider: this.smtp, ctx };
      }
    }
    // Fallback: config global din SettingsService
    return this.resolveGlobalContext(site);
  }

  private async resolveGlobalContext(site?: MailSiteRef): Promise<{ provider: MailProvider; ctx: ResolvedMailContext }> {
    const which = ((await this.settings.get('MAIL_PROVIDER')) || 'smtp').toLowerCase();
    const ctx: ResolvedMailContext = {
      source: 'global',
      siteSlug: site?.slug,
      fromEmail: (site?.fromEmail || (await this.settings.get('MAIL_FROM'))) || undefined,
      fromName: (await this.settings.get('MAIL_FROM_NAME')) || undefined,
    };
    if (which === 'mailgun') {
      ctx.mailgun = {
        apiKey: await this.settings.get('MAILGUN_API_KEY'),
        domain: await this.settings.get('MAILGUN_DOMAIN'),
        region: (((await this.settings.get('MAILGUN_REGION')) || 'us').toLowerCase() as 'eu' | 'us'),
        apiUrl: (await this.settings.get('MAILGUN_API_URL')) || undefined,
        fromEmail: (await this.settings.get('MAILGUN_FROM_EMAIL')) || undefined,
      };
      return { provider: this.mailgun, ctx };
    }
    ctx.smtp = {
      host: (await this.settings.get('SMTP_HOST')) || undefined,
      port: Number(await this.settings.get('SMTP_PORT')) || undefined,
      secure: (await this.settings.get('SMTP_SECURE')) === 'true',
      user: (await this.settings.get('SMTP_USER')) || undefined,
      pass: (await this.settings.get('SMTP_PASS')) || undefined,
    };
    if (!ctx.smtp.secure && ctx.smtp.port === 465) ctx.smtp.secure = true;
    return { provider: this.smtp, ctx };
  }

  /** Mod compatibil cu codul existent — întoarce un obiect simplu cu flag dev. */
  async send(
    opts: SendMailOptions,
    extra?: SendMailExtra,
  ): Promise<{ devLogged?: boolean; messageId?: string; provider: string }> {
    const result = await this.sendDetailed(opts, extra);
    return {
      devLogged: !result.sent,
      messageId: result.messageId,
      provider: result.provider,
    };
  }

  /** Trimite și întoarce rezultatul detaliat al provider-ului. */
  async sendDetailed(opts: SendMailOptions, extra?: SendMailExtra): Promise<SendMailResult> {
    const { provider, ctx } = await this.resolveContext(extra?.site);
    try {
      const result = await provider.send(opts, ctx);
      if (result.sent) {
        this.logger.log(
          `mail sent via ${result.provider} src=${ctx.source}${ctx.siteSlug ? ' site=' + ctx.siteSlug : ''} to=${opts.to} id=${result.messageId ?? '-'}`,
        );
      } else {
        this.logger.warn(`mail not sent (${result.notes ?? 'unknown'}) to=${opts.to}`);
      }
      return result;
    } catch (err) {
      this.logger.error(`mail provider ${provider.name} failed: ${(err as Error).message}`);
      throw err;
    }
  }

  /** Numele provider-ului activ pentru un site dat (sau global). */
  async providerName(site?: MailSiteRef): Promise<string> {
    const { provider } = await this.resolveContext(site);
    return provider.name;
  }
}

/** Decriptare tolerantă: dacă valoarea nu pare criptată, întoarce as-is. */
function safeDecrypt(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string' && value.startsWith('v1:')) {
    try {
      return decryptSecret(value);
    } catch {
      return undefined;
    }
  }
  return value;
}

@Module({
  imports: [ConfigModule],
  providers: [SmtpMailProvider, MailgunMailProvider, MailerService],
  exports: [MailerService],
})
export class MailerModule {}
