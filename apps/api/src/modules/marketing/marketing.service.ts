import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { User } from '../users/user.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { Payment } from '../payments/payment.entity';
import { PromoCode } from '../promo/promo-code.entity';
import { PromoService } from '../promo/promo.service';
import { OutboundEmail } from '../outbound-email/outbound-email.entity';
import { SitesService } from '../sites/sites.service';
import { MailerService } from '../../mailer/mailer.module';
import { brandingFromSite } from '../../mailer/branding';
import type { Site } from '../sites/site.entity';
import { findMarketingTemplate, type MarketingRenderVars } from '../../mailer/templates/marketing';
import { listCatalog, renderPreview } from '../../mailer/templates/template-catalog';
import {
  MarketingCampaign,
  MarketingRule,
  type CampaignAudience,
  type RuleTrigger,
} from './marketing.entities';

export interface AudienceRecipient {
  email: string;
  name: string | null;
  locale: string;
  userId: string | null;
  guestId: string | null;
}

@Injectable()
export class MarketingService {
  private readonly logger = new Logger('MarketingService');

  constructor(
    @InjectRepository(MarketingCampaign) private readonly campaigns: Repository<MarketingCampaign>,
    @InjectRepository(MarketingRule) private readonly rules: Repository<MarketingRule>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(GuestSession) private readonly guests: Repository<GuestSession>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(PromoCode) private readonly promoCodes: Repository<PromoCode>,
    @InjectRepository(OutboundEmail) private readonly outbound: Repository<OutboundEmail>,
    private readonly promo: PromoService,
    private readonly sites: SitesService,
    private readonly mailer: MailerService,
  ) {}

  // ============ Șabloane ============

  listTemplates() {
    return listCatalog();
  }

  async previewTemplate(siteId: string | null, id: string, overrides?: Partial<MarketingRenderVars>) {
    const site = siteId ? await this.sites.findById(siteId) : null;
    const branding = brandingFromSite(site);
    const locale = overrides?.locale ?? site?.locale ?? 'ro';
    const rendered = renderPreview(id, { locale, branding }, overrides);
    if (!rendered) throw new NotFoundException('Template inexistent');
    return rendered;
  }

  // ============ Audiență ============

  /** Construiește lista de destinatari (useri + guests cu email), deduplicată pe email. */
  async buildAudience(siteId: string | null, segment: CampaignAudience): Promise<AudienceRecipient[]> {
    const site = siteId ? await this.sites.findById(siteId) : null;
    const fallbackLocale = site?.locale ?? 'ro';

    const userWhere = siteId ? { siteId, email: Not(IsNull()) } : { email: Not(IsNull()) };
    const guestWhere = siteId ? { siteId, email: Not(IsNull()) } : { email: Not(IsNull()) };

    const [users, guests, paidPayments] = await Promise.all([
      this.users.find({ where: userWhere as object, select: ['id', 'email', 'name', 'locale'] }),
      this.guests.find({ where: guestWhere as object, select: ['id', 'email'] }),
      this.payments.find({
        where: (siteId ? { siteId, status: 'paid' } : { status: 'paid' }) as object,
        select: ['userId', 'guestId'],
      }),
    ]);

    const paidUserIds = new Set(paidPayments.map((p) => p.userId).filter(Boolean) as string[]);
    const paidGuestIds = new Set(paidPayments.map((p) => p.guestId).filter(Boolean) as string[]);

    const byEmail = new Map<string, AudienceRecipient & { paid: boolean }>();

    for (const u of users) {
      const email = (u.email || '').trim().toLowerCase();
      if (!email) continue;
      byEmail.set(email, {
        email,
        name: u.name ?? null,
        locale: u.locale || fallbackLocale,
        userId: u.id,
        guestId: null,
        paid: paidUserIds.has(u.id),
      });
    }
    for (const g of guests) {
      const email = (g.email || '').trim().toLowerCase();
      if (!email) continue;
      const existing = byEmail.get(email);
      if (existing) {
        if (paidGuestIds.has(g.id)) existing.paid = true;
        if (!existing.guestId) existing.guestId = g.id;
        continue;
      }
      byEmail.set(email, {
        email,
        name: null,
        locale: fallbackLocale,
        userId: null,
        guestId: g.id,
        paid: paidGuestIds.has(g.id),
      });
    }

    const all = Array.from(byEmail.values());
    const filtered =
      segment === 'all' ? all : segment === 'payers' ? all.filter((r) => r.paid) : all.filter((r) => !r.paid);
    return filtered.map(({ paid: _paid, ...r }) => r);
  }

  async audienceCounts(siteId: string | null): Promise<{ all: number; payers: number; nonpayers: number }> {
    const all = await this.buildAudience(siteId, 'all');
    const payers = await this.buildAudience(siteId, 'payers');
    return { all: all.length, payers: payers.length, nonpayers: all.length - payers.length };
  }

  // ============ Campanii ============

  listCampaigns(siteId: string | null) {
    const where = siteId ? { siteId } : {};
    return this.campaigns.find({ where, order: { createdAt: 'DESC' }, take: 100 });
  }

  getCampaign(id: string) {
    return this.campaigns.findOne({ where: { id } });
  }

  /** Creează campania și pornește trimiterea în background. */
  async createCampaign(
    siteId: string | null,
    input: {
      name: string;
      templateId: string;
      audience: CampaignAudience;
      promoCodeId?: string | null;
      overrides?: Record<string, unknown> | null;
    },
    adminEmail: string | null,
  ): Promise<MarketingCampaign> {
    if (!siteId) {
      throw new BadRequestException(
        'Selectează un site anume pentru a trimite o campanie (nu „Toate site-urile").',
      );
    }
    const tpl = findMarketingTemplate(input.templateId);
    if (!tpl) throw new BadRequestException('Șablon de marketing invalid sau ne-trimisibil');

    let promoCodeSnapshot: string | null = null;
    if (input.promoCodeId) {
      const promo = await this.promoCodes.findOne({ where: { id: input.promoCodeId } });
      if (!promo) throw new BadRequestException('Cod promo inexistent');
      promoCodeSnapshot = promo.code;
    }

    const recipients = await this.buildAudience(siteId, input.audience);
    if (recipients.length === 0) throw new BadRequestException('Niciun destinatar pentru segmentul ales');

    const campaign = await this.campaigns.save(
      this.campaigns.create({
        siteId,
        name: input.name,
        templateId: input.templateId,
        audience: input.audience,
        promoCodeId: input.promoCodeId ?? null,
        promoCodeSnapshot,
        overrides: input.overrides ?? null,
        status: 'sending',
        totalRecipients: recipients.length,
        sentCount: 0,
        failedCount: 0,
        createdByEmail: adminEmail,
      }),
    );

    // Trimitere în background — nu blocăm request-ul admin.
    void this.sendCampaignWork(campaign.id, siteId, input.templateId, recipients, promoCodeSnapshot, input.overrides ?? null);

    return campaign;
  }

  private async sendCampaignWork(
    campaignId: string,
    siteId: string | null,
    templateId: string,
    recipients: AudienceRecipient[],
    promoCode: string | null,
    overrides: Record<string, unknown> | null,
  ): Promise<void> {
    const tpl = findMarketingTemplate(templateId);
    if (!tpl) return;
    const site = siteId ? await this.sites.findById(siteId) : null;
    const branding = brandingFromSite(site);
    const ctaUrl = (overrides?.ctaUrl as string) || branding?.siteUrl || 'https://manelecadou.ro';
    const discountLabel = promoCode ? (overrides?.discountLabel as string) ?? null : null;

    let sent = 0;
    let failed = 0;
    for (const r of recipients) {
      const vars: MarketingRenderVars = {
        recipientName: r.name,
        ctaUrl,
        ctaLabel: (overrides?.ctaLabel as string) ?? null,
        promoCode: promoCode,
        discountLabel,
        validUntil: (overrides?.validUntil as string) ?? null,
        headline: (overrides?.headline as string) ?? null,
        bodyHtml: (overrides?.bodyHtml as string) ?? null,
        locale: r.locale,
        branding,
      };
      try {
        const out = tpl.render(vars);
        await this.mailer.send(
          { to: r.email, subject: out.subject, html: out.html, text: out.text },
          { site: site ?? undefined, kind: 'marketing_campaign', userId: r.userId, relatedId: campaignId },
        );
        sent++;
      } catch (e) {
        failed++;
        this.logger.warn(`campaign ${campaignId} send failed to ${r.email}: ${(e as Error).message}`);
      }
      // Update periodic ca UI-ul să vadă progresul.
      if ((sent + failed) % 10 === 0) {
        await this.campaigns.update({ id: campaignId }, { sentCount: sent, failedCount: failed }).catch(() => {});
      }
    }
    await this.campaigns
      .update(
        { id: campaignId },
        { sentCount: sent, failedCount: failed, status: failed > 0 && sent === 0 ? 'failed' : 'sent', sentAt: new Date() },
      )
      .catch(() => {});
    this.logger.log(`campaign ${campaignId} done: sent=${sent} failed=${failed}`);
  }

  // ============ Reguli automate ============

  listRules(siteId: string | null) {
    const where = siteId ? { siteId } : {};
    return this.rules.find({ where, order: { createdAt: 'DESC' }, take: 100 });
  }

  async createRule(
    siteId: string | null,
    input: {
      name: string;
      trigger: RuleTrigger;
      daysAfter: number;
      templateId: string;
      discountType: 'percent' | 'fixed';
      discountValue: number;
      validDays: number;
      active?: boolean;
    },
  ): Promise<MarketingRule> {
    if (!siteId) {
      throw new BadRequestException(
        'Selectează un site anume pentru a crea o regulă (nu „Toate site-urile").',
      );
    }
    if (!findMarketingTemplate(input.templateId)) throw new BadRequestException('Șablon invalid');
    return this.rules.save(
      this.rules.create({
        siteId,
        name: input.name,
        trigger: input.trigger,
        daysAfter: input.daysAfter,
        templateId: input.templateId,
        discountType: input.discountType,
        discountValue: input.discountValue,
        validDays: input.validDays,
        active: input.active ?? false,
      }),
    );
  }

  async updateRule(id: string, patch: Partial<MarketingRule>): Promise<MarketingRule> {
    const rule = await this.rules.findOne({ where: { id } });
    if (!rule) throw new NotFoundException('Regulă inexistentă');
    Object.assign(rule, patch);
    return this.rules.save(rule);
  }

  async deleteRule(id: string): Promise<{ ok: true }> {
    await this.rules.delete({ id });
    return { ok: true };
  }

  /** Rulează o regulă (manual sau din cron). Întoarce câți au fost trimiși. */
  async runRule(ruleId: string, maxPerRun: number): Promise<{ sent: number; eligible: number }> {
    const rule = await this.rules.findOne({ where: { id: ruleId } });
    if (!rule) throw new NotFoundException('Regulă inexistentă');

    const tpl = findMarketingTemplate(rule.templateId);
    if (!tpl) throw new BadRequestException('Șablonul regulii nu mai există');

    const site = rule.siteId ? await this.sites.findById(rule.siteId) : null;
    const branding = brandingFromSite(site);
    const ctaUrl = branding?.siteUrl || 'https://manelecadou.ro';
    const currency = site?.currency || 'RON';

    // Audiență după trigger.
    const segment: CampaignAudience = rule.trigger === 'payer' ? 'payers' : 'nonpayers';
    const audience = await this.buildAudience(rule.siteId, segment);

    // Filtru pe vechime: înscriși de cel puțin daysAfter zile.
    const cutoff = new Date(Date.now() - rule.daysAfter * 24 * 60 * 60 * 1000);
    const eligibleUserIds = await this.userIdsRegisteredBefore(rule.siteId, cutoff);
    const eligible = audience.filter((r) => r.userId && eligibleUserIds.has(r.userId));

    // Dedup: nu retrimite celor cărora regula le-a trimis deja.
    const alreadySent = await this.emailsAlreadySentByRule(ruleId);
    const todo = eligible.filter((r) => !alreadySent.has(r.email)).slice(0, maxPerRun);

    const discountLabel =
      rule.discountType === 'percent' ? `${rule.discountValue}%` : `${(rule.discountValue / 100).toFixed(0)} ${currency}`;
    const validUntil = new Date(Date.now() + rule.validDays * 24 * 60 * 60 * 1000);

    let sent = 0;
    for (const r of todo) {
      try {
        // Cod personal per destinatar (restricționat pe email, o singură folosire).
        const code = await this.promo.create({
          siteId: rule.siteId,
          discountType: rule.discountType,
          discountValue: rule.discountValue,
          validUntil,
          maxUses: 1,
          restrictedToEmail: r.email,
          note: `Auto: regula „${rule.name}"`,
        });
        const vars: MarketingRenderVars = {
          recipientName: r.name,
          ctaUrl,
          promoCode: code.code,
          discountLabel,
          validUntil: validUntil.toLocaleDateString(localeToDateLocale(r.locale)),
          locale: r.locale,
          branding,
        };
        const out = tpl.render(vars);
        await this.mailer.send(
          { to: r.email, subject: out.subject, html: out.html, text: out.text },
          { site: site ?? undefined, kind: 'marketing_rule', userId: r.userId, relatedId: ruleId },
        );
        sent++;
      } catch (e) {
        this.logger.warn(`rule ${ruleId} send failed to ${r.email}: ${(e as Error).message}`);
      }
    }

    rule.totalSent += sent;
    rule.lastRunAt = new Date();
    await this.rules.save(rule);
    return { sent, eligible: eligible.length };
  }

  /** Toate regulile active (pentru cron). */
  activeRules() {
    return this.rules.find({ where: { active: true } });
  }

  private async userIdsRegisteredBefore(siteId: string | null, cutoff: Date): Promise<Set<string>> {
    const qb = this.users
      .createQueryBuilder('u')
      .select('u.id', 'id')
      .where('u.createdAt <= :cutoff', { cutoff });
    if (siteId) qb.andWhere('u.siteId = :siteId', { siteId });
    const rows = await qb.getRawMany<{ id: string }>();
    return new Set(rows.map((r) => r.id));
  }

  private async emailsAlreadySentByRule(ruleId: string): Promise<Set<string>> {
    const rows = await this.outbound
      .createQueryBuilder('e')
      .select('LOWER(e.to)', 'email')
      .where('e.relatedId = :ruleId', { ruleId })
      .andWhere('e.kind = :kind', { kind: 'marketing_rule' })
      .getRawMany<{ email: string }>();
    return new Set(rows.map((r) => r.email));
  }
}

/** Mapează locale → locale pentru toLocaleDateString (best-effort). */
function localeToDateLocale(locale: string): string {
  const map: Record<string, string> = {
    ro: 'ro-RO', bg: 'bg-BG', sr: 'sr-RS', tr: 'tr-TR', el: 'el-GR', hr: 'hr-HR', sl: 'sl-SI', bs: 'bs-BA',
  };
  return map[locale] ?? 'ro-RO';
}
