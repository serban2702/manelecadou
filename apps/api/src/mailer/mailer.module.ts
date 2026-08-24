import { Injectable, Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BuiltMime, MailProvider, ResolvedMailContext, SendMailOptions, SendMailResult } from './mail.types';
import { SmtpMailProvider } from './providers/smtp.provider';
import { MailgunMailProvider } from './providers/mailgun.provider';
import { buildMime } from './mime.builder';
import { MAIL_APPEND_QUEUE, MailAppendJob, stashMime } from './mail-append.queue';
import { SettingsService } from '../modules/settings/settings.service';
import type { Site, SiteMailConfig } from '../modules/sites/site.entity';
import { decryptSecret } from '../common/crypto.util';
import { OutboundEmailModule } from '../modules/outbound-email/outbound-email.module';
import { OutboundEmailService } from '../modules/outbound-email/outbound-email.service';
import { StorageService } from '../storage/storage.service';

export type MailSiteRef = Site | { id?: string; slug?: string; mailConfig?: SiteMailConfig; fromEmail?: string | null; supportEmail?: string | null } | null | undefined;

/**
 * Extra context care poate fi trimis la send() ca să rezolve providerul + credențialele.
 * Dacă `site` are mailConfig.provider setat, folosim configul lui. Altfel cădem
 * pe configul global din SettingsService (env / db settings).
 */
export interface SendMailExtra {
  /** Site-ul curent (cu mailConfig). Decriptarea secretelor are loc aici. */
  site?: MailSiteRef;
  /** Categorie funcțională pentru audit (ex: magic_link, gift_code, generation_done). */
  kind?: string;
  /** ID-ul userului care a triggered email-ul (opțional). */
  userId?: string | null;
  /** ID-ul entității asociate (paymentId, generationId, giftCodeId etc.). */
  relatedId?: string | null;
  /**
   * Forțează un provider anume, indiferent de configul global/site. Folosit la
   * compunerea din Inbox („trimite cu mail, nu prin SMTP") → mereu Mailgun, chiar
   * dacă `MAIL_PROVIDER` global e setat pe `smtp`. Dacă site-ul are credențiale
   * proprii pentru providerul cerut le folosește pe alea, altfel cade pe cele globale.
   */
  forceProvider?: 'smtp' | 'mailgun';
  /**
   * Sare peste copierea în `Sent` (IMAP APPEND). Folosit pentru mailurile care
   * nu au ce căuta în căsuță (ex. testul de config din admin).
   */
  skipSentCopy?: boolean;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger('MailerService');

  constructor(
    private readonly smtp: SmtpMailProvider,
    private readonly mailgun: MailgunMailProvider,
    private readonly settings: SettingsService,
    private readonly outboundLog: OutboundEmailService,
    // Global (StorageModule) — MIME-ul copiat în `Sent` merge pe disc + R2.
    private readonly storage: StorageService,
    @InjectQueue(MAIL_APPEND_QUEUE) private readonly appendQueue: Queue,
  ) {}

  /**
   * Rezolvă configul de mail: dacă site-ul are mailConfig.provider, folosim
   * configul per-tenant (cu decriptare); altfel cădem pe configul global.
   */
  private async resolveContext(
    site?: MailSiteRef,
    force?: 'smtp' | 'mailgun',
  ): Promise<{ provider: MailProvider; ctx: ResolvedMailContext }> {
    const mc = site?.mailConfig;
    // Folosește configul per-site doar dacă există ȘI nu intră în conflict cu providerul forțat.
    if (mc?.provider && (!force || mc.provider === force)) {
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
    // Provider forțat fără config per-site potrivit → folosește credențialele globale ale acelui provider.
    if (force === 'mailgun') {
      return { provider: this.mailgun, ctx: await this.buildGlobalMailgunCtx(site) };
    }
    if (force === 'smtp') {
      return { provider: this.smtp, ctx: await this.buildGlobalSmtpCtx(site) };
    }
    // Fallback: config global din SettingsService (după MAIL_PROVIDER)
    return this.resolveGlobalContext(site);
  }

  private async resolveGlobalContext(site?: MailSiteRef): Promise<{ provider: MailProvider; ctx: ResolvedMailContext }> {
    const which = ((await this.settings.get('MAIL_PROVIDER')) || 'smtp').toLowerCase();
    if (which === 'mailgun') {
      return { provider: this.mailgun, ctx: await this.buildGlobalMailgunCtx(site) };
    }
    return { provider: this.smtp, ctx: await this.buildGlobalSmtpCtx(site) };
  }

  private async buildGlobalMailgunCtx(site?: MailSiteRef): Promise<ResolvedMailContext> {
    return {
      source: 'global',
      siteSlug: site?.slug,
      fromEmail: (site?.fromEmail || (await this.settings.get('MAIL_FROM'))) || undefined,
      fromName: (await this.settings.get('MAIL_FROM_NAME')) || undefined,
      mailgun: {
        apiKey: await this.settings.get('MAILGUN_API_KEY'),
        domain: await this.settings.get('MAILGUN_DOMAIN'),
        region: (((await this.settings.get('MAILGUN_REGION')) || 'us').toLowerCase() as 'eu' | 'us'),
        apiUrl: (await this.settings.get('MAILGUN_API_URL')) || undefined,
        fromEmail: (await this.settings.get('MAILGUN_FROM_EMAIL')) || undefined,
      },
    };
  }

  private async buildGlobalSmtpCtx(site?: MailSiteRef): Promise<ResolvedMailContext> {
    const ctx: ResolvedMailContext = {
      source: 'global',
      siteSlug: site?.slug,
      fromEmail: (site?.fromEmail || (await this.settings.get('MAIL_FROM'))) || undefined,
      fromName: (await this.settings.get('MAIL_FROM_NAME')) || undefined,
      smtp: {
        host: (await this.settings.get('SMTP_HOST')) || undefined,
        port: Number(await this.settings.get('SMTP_PORT')) || undefined,
        secure: (await this.settings.get('SMTP_SECURE')) === 'true',
        user: (await this.settings.get('SMTP_USER')) || undefined,
        pass: (await this.settings.get('SMTP_PASS')) || undefined,
      },
    };
    if (ctx.smtp && !ctx.smtp.secure && ctx.smtp.port === 465) ctx.smtp.secure = true;
    return ctx;
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
    const { provider, ctx } = await this.resolveContext(extra?.site, extra?.forceProvider);
    // Audit row creat ÎNAINTE de send — prinde și crash-urile provider-elor.
    // Failure-urile la insert (DB down) nu trebuie să blocheze trimiterea mail-ului.
    const siteId = (extra?.site as { id?: string } | undefined)?.id ?? null;
    let logId: string | null = null;
    try {
      const row = await this.outboundLog.record({
        siteId,
        kind: extra?.kind ?? null,
        to: opts.to,
        fromAddress: opts.from ?? ctx.fromEmail ?? null,
        replyTo: opts.replyTo ?? ctx.replyTo ?? null,
        subject: opts.subject,
        html: opts.html,
        text: opts.text ?? null,
        userId: extra?.userId ?? null,
        relatedId: extra?.relatedId ?? null,
      });
      logId = row.id;
    } catch (logErr) {
      this.logger.warn(`outbound-email log insert failed: ${(logErr as Error).message}`);
    }

    // MIME-ul se construiește o singură dată, aici: aceiași octeți pleacă la
    // client (prin oricare provider) și se salvează în `Sent`.
    const mime = await buildMime(opts, ctx);

    try {
      const result = await provider.send(opts, ctx, mime);
      if (result.sent) {
        this.logger.log(
          `mail sent via ${result.provider} src=${ctx.source}${ctx.siteSlug ? ' site=' + ctx.siteSlug : ''} to=${opts.to} id=${result.messageId ?? '-'}`,
        );
        if (!extra?.skipSentCopy) await this.queueSentCopy(mime, opts, siteId);
        if (logId) {
          await this.outboundLog
            .markSent(logId, {
              provider: result.provider,
              providerMessageId: result.messageId,
              providerNotes: result.notes,
            })
            .catch((e) => this.logger.warn(`outbound-email markSent failed: ${(e as Error).message}`));
        }
      } else {
        this.logger.warn(`mail not sent (${result.notes ?? 'unknown'}) to=${opts.to}`);
        if (logId) {
          // Provider a întors `sent=false` (ex. noop în dev) — păstrăm `queued` cu note
          // sau marcăm sent cu nota „dev-noop", la alegere. Aici: marcăm sent dacă e noop
          // (deja procesat — nu va mai fi retry) ca să nu apară fals în coada „queued".
          await this.outboundLog
            .markSent(logId, {
              provider: result.provider,
              providerMessageId: result.messageId,
              providerNotes: result.notes ?? 'not sent',
            })
            .catch((e) => this.logger.warn(`outbound-email markSent(noop) failed: ${(e as Error).message}`));
        }
      }
      return result;
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      this.logger.error(`mail provider ${provider.name} failed: ${msg}`);
      if (logId) {
        await this.outboundLog
          .markFailed(logId, msg, provider.name)
          .catch((e) => this.logger.warn(`outbound-email markFailed failed: ${(e as Error).message}`));
      }
      throw err;
    }
  }

  /**
   * Pune mailul trimis la coadă pentru copiere în `Sent` prin IMAP APPEND.
   *
   * Rulează după ce providerul a confirmat trimiterea și e deliberat
   * fire-and-forget: dacă serverul IMAP e jos sau căsuța e plină, mailul tot a
   * ajuns la client — copia se reîncearcă din coadă. Nicio eroare de aici nu
   * trebuie să rupă un magic link.
   */
  private async queueSentCopy(mime: BuiltMime, opts: SendMailOptions, siteId: string | null): Promise<void> {
    try {
      const mimePath = await stashMime(this.storage, mime.raw);
      const job: MailAppendJob = {
        siteId,
        fromAddr: mime.envelopeFrom,
        mimePath,
        messageId: mime.messageId,
        subject: opts.subject,
        to: opts.to,
      };
      await this.appendQueue.add('append', job, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      });
    } catch (e) {
      this.logger.warn(`sent-copy enqueue failed: ${(e as Error).message}`);
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
  imports: [ConfigModule, OutboundEmailModule, BullModule.registerQueue({ name: MAIL_APPEND_QUEUE })],
  providers: [SmtpMailProvider, MailgunMailProvider, MailerService],
  exports: [MailerService],
})
export class MailerModule {}
