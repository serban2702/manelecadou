import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { GiftCode, GiftTier, TIER_PRICES_RON, TIER_USES } from './gift-code.entity';
import { User } from '../users/user.entity';
import { MailerService } from '../../mailer/mailer.module';
import { giftCodeTemplate } from '../../mailer/templates/templates';

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class GiftCodesService {
  private readonly logger = new Logger('GiftCodesService');

  constructor(
    @InjectRepository(GiftCode) private readonly repo: Repository<GiftCode>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
    private readonly dataSource: DataSource,
  ) {}

  generateCode(): string {
    // Format: GIFT-XXXX (12 chars total cu prefix + 8 random)
    const buf = randomBytes(8);
    let s = 'GIFT-';
    for (let i = 0; i < 8; i++) s += ALPHA[buf[i] % ALPHA.length];
    return s;
  }

  /**
   * Creează un cod cadou în DB (după plata confirmată) și trimite email-ul.
   * Idempotent prin paymentId — apelarea repetată cu același paymentId nu duplicachează.
   */
  async issueAfterPayment(input: {
    paymentId: string;
    tier: GiftTier;
    purchasedByUserId?: string | null;
    purchasedByGuestId?: string | null;
    purchasedByEmail?: string | null;
    siteId?: string | null;
  }): Promise<GiftCode> {
    const existing = await this.repo.findOne({ where: { paymentId: input.paymentId } });
    if (existing) return existing;

    let code = this.generateCode();
    // codul e unic în (siteId, code) — caută doar pe site-ul curent (sau global dacă siteId lipsește).
    const codeExistsWhere = input.siteId
      ? { code, siteId: input.siteId }
      : { code };
    while (await this.repo.findOne({ where: codeExistsWhere })) {
      code = this.generateCode();
    }
    const validUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const totalUses = TIER_USES[input.tier];

    const created = await this.repo.save(
      this.repo.create({
        code,
        tier: input.tier,
        usesLeft: totalUses,
        totalUses,
        purchasedByUserId: input.purchasedByUserId ?? null,
        purchasedByGuestId: input.purchasedByGuestId ?? null,
        purchasedByEmail: input.purchasedByEmail ?? null,
        paymentId: input.paymentId,
        siteId: input.siteId ?? null,
        validUntil,
        active: true,
      }),
    );

    if (input.purchasedByEmail) {
      const appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:1500';
      const tpl = giftCodeTemplate({
        code: created.code,
        redeemUrl: `${appUrl}/cadou/redeem?code=${encodeURIComponent(created.code)}`,
        validUntil: created.validUntil.toLocaleDateString('ro-RO'),
        tier:
          input.tier === 'single'
            ? '1 manea'
            : input.tier === 'pack3'
            ? '3 manele'
            : '10 manele',
      });
      try {
        await this.mailer.send({
          to: input.purchasedByEmail,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
        });
      } catch (err) {
        this.logger.warn(`Failed to email gift code ${created.code}: ${(err as Error).message}`);
      }
    }
    this.logger.log(`Gift code ${created.code} (${input.tier}) created for ${input.purchasedByEmail ?? 'anon'}`);
    return created;
  }

  async findByCode(rawCode: string, siteId: string | null): Promise<GiftCode | null> {
    const code = (rawCode ?? '').toUpperCase().trim();
    if (!code) return null;
    return this.repo.findOne({ where: siteId ? { code, siteId } : { code } });
  }

  /**
   * Validează un cod (status, expirare, uses).
   */
  async validate(
    rawCode: string,
    siteId: string | null,
  ): Promise<{ ok: boolean; reason?: string; code?: GiftCode }> {
    const code = await this.findByCode(rawCode, siteId);
    if (!code || !code.active) return { ok: false, reason: 'invalid' };
    if (code.validUntil.getTime() < Date.now()) return { ok: false, reason: 'expired' };
    if (code.usesLeft <= 0) return { ok: false, reason: 'used_up' };
    return { ok: true, code };
  }

  /**
   * Folosește o singură utilizare a codului (atomic). Întoarce false dacă nu mai are use-uri.
   * Codul e scoped pe siteId — codurile RO nu pot fi folosite pe BG, etc.
   */
  async consume(
    rawCode: string,
    redeemer: { userId: string | null; guestId: string | null; siteId: string | null },
  ): Promise<{ ok: boolean; reason?: string; usesLeft?: number }> {
    return this.dataSource.transaction(async (mgr) => {
      const repo = mgr.getRepository(GiftCode);
      const trimmed = (rawCode ?? '').toUpperCase().trim();
      const where = redeemer.siteId
        ? { code: trimmed, siteId: redeemer.siteId }
        : { code: trimmed };
      const code = await repo.findOne({ where });
      if (!code || !code.active) return { ok: false, reason: 'invalid' };
      if (code.validUntil.getTime() < Date.now()) return { ok: false, reason: 'expired' };
      if (code.usesLeft <= 0) return { ok: false, reason: 'used_up' };

      code.usesLeft -= 1;
      code.lastRedeemedByUserId = redeemer.userId;
      code.lastRedeemedByGuestId = redeemer.guestId;
      code.lastRedeemedAt = new Date();
      await repo.save(code);
      return { ok: true, usesLeft: code.usesLeft };
    });
  }

  async listMine(userId: string): Promise<GiftCode[]> {
    return this.repo.find({
      where: { purchasedByUserId: userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async listAll(siteId: string | null): Promise<GiftCode[]> {
    return this.repo.find({
      where: siteId ? { siteId } : {},
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async setActive(id: string, active: boolean): Promise<GiftCode> {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Gift code not found');
    c.active = active;
    return this.repo.save(c);
  }

  /** Pentru admin: extend valabilitate cu N zile */
  async extend(id: string, addDays: number): Promise<GiftCode> {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Gift code not found');
    c.validUntil = new Date(c.validUntil.getTime() + addDays * 86_400_000);
    return this.repo.save(c);
  }

  static priceForTier(tier: GiftTier): number {
    return TIER_PRICES_RON[tier];
  }
}
