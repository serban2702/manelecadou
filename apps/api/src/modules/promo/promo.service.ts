import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, IsNull } from 'typeorm';
import { randomBytes } from 'crypto';
import { PromoCode, PromoRedemption } from './promo-code.entity';

export interface ValidationResult {
  ok: boolean;
  reason?: string;
  promoCodeId?: string;
  discountType?: 'percent' | 'fixed';
  discountValue?: number;
  /** valoarea efectiv calculată în cents față de un baseAmountCents dat */
  appliedDiscountCents?: number;
}

@Injectable()
export class PromoService {
  constructor(
    @InjectRepository(PromoCode) private readonly codes: Repository<PromoCode>,
    @InjectRepository(PromoRedemption) private readonly reds: Repository<PromoRedemption>,
  ) {}

  /** Generează un cod aleator de 8 chars (uppercase + cifre, fără 0/O/I/1) */
  generateCode(prefix = ''): string {
    const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const len = 8 - prefix.length;
    const buf = randomBytes(len);
    let code = prefix;
    for (let i = 0; i < len; i++) code += ALPHA[buf[i] % ALPHA.length];
    return code;
  }

  async create(input: {
    siteId: string | null;
    code?: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
    validFrom?: Date | null;
    validUntil?: Date | null;
    maxUses?: number;
    restrictedToEmail?: string | null;
    note?: string | null;
    source?: PromoCode['source'];
  }): Promise<PromoCode> {
    let code = (input.code ?? this.generateCode()).toUpperCase();
    // unique pe (siteId, code)
    while (await this.codes.findOne({ where: this.scopedCodeWhere(code, input.siteId) })) {
      code = this.generateCode();
    }
    const created = this.codes.create({
      siteId: input.siteId,
      code,
      discountType: input.discountType,
      discountValue: input.discountValue,
      validFrom: input.validFrom ?? null,
      validUntil: input.validUntil ?? null,
      maxUses: input.maxUses ?? 0,
      usedCount: 0,
      restrictedToEmail: input.restrictedToEmail?.toLowerCase().trim() || null,
      note: input.note ?? null,
      source: input.source ?? null,
      active: true,
    });
    return this.codes.save(created);
  }

  /**
   * Emite (sau refolosește) un cod de fidelizare „next order" pentru emailul de
   * melodie finalizată. Idempotent pe `dedupeNote` (ex. `gen:<id>`): dacă există
   * deja un cod pentru aceeași generație, îl întoarce pe acela — ca re-trimiterea
   * emailului (retry worker) să NU creeze coduri multiple. Cod single-use, legat
   * de email, cu expirare scurtă.
   */
  async issueNextOrderDiscount(input: {
    siteId: string | null;
    email: string;
    percent: number;
    validHours: number;
    dedupeNote: string;
  }): Promise<PromoCode> {
    const existing = await this.codes.findOne({
      where: {
        siteId: input.siteId ?? IsNull(),
        note: input.dedupeNote,
        source: 'post_generation',
      },
    });
    if (existing) return existing;
    return this.create({
      siteId: input.siteId,
      discountType: 'percent',
      discountValue: input.percent,
      validUntil: new Date(Date.now() + input.validHours * 3600 * 1000),
      maxUses: 1,
      restrictedToEmail: input.email,
      note: input.dedupeNote,
      source: 'post_generation',
    });
  }

  /** 40% one-shot după follow TikTok + Facebook pe pagina manelei. Idempotent pe guest. */
  async issueSocialFollowDiscount(input: {
    siteId: string | null;
    guestId: string;
    email?: string | null;
  }): Promise<PromoCode> {
    const note = `social_follow guest:${input.guestId}`;
    const existing = await this.codes.findOne({
      where: { note, source: 'social_follow' },
    });
    if (existing) return existing;
    return this.create({
      siteId: input.siteId,
      discountType: 'percent',
      discountValue: 40,
      maxUses: 1,
      restrictedToEmail: null,
      note,
      source: 'social_follow',
    });
  }

  /** Listare admin. siteId === null → cross-site (admin „Toate"). */
  async list(siteId: string | null): Promise<PromoCode[]> {
    const where: FindOptionsWhere<PromoCode> = siteId ? { siteId } : {};
    return this.codes.find({ where, order: { createdAt: 'DESC' }, take: 200 });
  }

  async setActive(id: string, active: boolean): Promise<PromoCode> {
    const c = await this.codes.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Promo not found');
    c.active = active;
    return this.codes.save(c);
  }

  async update(
    id: string,
    patch: {
      code?: string;
      discountType?: 'percent' | 'fixed';
      discountValue?: number;
      validFrom?: Date | null;
      validUntil?: Date | null;
      maxUses?: number;
      restrictedToEmail?: string | null;
      note?: string | null;
      active?: boolean;
    },
  ): Promise<PromoCode> {
    const c = await this.codes.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Promo not found');
    if (patch.code !== undefined) {
      const newCode = patch.code.toUpperCase().trim();
      if (!newCode) throw new BadRequestException('Cod gol');
      if (newCode !== c.code) {
        const existing = await this.codes.findOne({ where: this.scopedCodeWhere(newCode, c.siteId) });
        if (existing && existing.id !== c.id) {
          throw new BadRequestException('Cod deja folosit pe acest site');
        }
        c.code = newCode;
      }
    }
    if (patch.discountType !== undefined) c.discountType = patch.discountType;
    if (patch.discountValue !== undefined) c.discountValue = patch.discountValue;
    if (patch.validFrom !== undefined) c.validFrom = patch.validFrom;
    if (patch.validUntil !== undefined) c.validUntil = patch.validUntil;
    if (patch.maxUses !== undefined) c.maxUses = patch.maxUses;
    if (patch.restrictedToEmail !== undefined) {
      c.restrictedToEmail = patch.restrictedToEmail
        ? patch.restrictedToEmail.toLowerCase().trim()
        : null;
    }
    if (patch.note !== undefined) c.note = patch.note;
    if (patch.active !== undefined) c.active = patch.active;
    return this.codes.save(c);
  }

  async delete(id: string): Promise<{ ok: true }> {
    const c = await this.codes.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Promo not found');
    // Soft block — dacă a fost folosit, NU șterge (păstrăm trail-ul pentru rapoarte).
    if (c.usedCount > 0) {
      throw new BadRequestException(
        `Codul ${c.code} a fost folosit ${c.usedCount} ori. Dezactivează-l în loc să-l ștergi.`,
      );
    }
    await this.codes.delete({ id });
    return { ok: true };
  }

  async validate(
    rawCode: string,
    email: string | undefined,
    baseAmountCents: number | undefined,
    siteId: string | null,
  ): Promise<ValidationResult> {
    const code = (rawCode ?? '').toUpperCase().trim();
    if (!code) return { ok: false, reason: 'empty' };
    const c = await this.codes.findOne({ where: this.scopedCodeWhere(code, siteId) });
    if (!c || !c.active) return { ok: false, reason: 'invalid' };
    const now = new Date();
    if (c.validFrom && now < c.validFrom) return { ok: false, reason: 'not_yet_valid' };
    if (c.validUntil && now > c.validUntil) return { ok: false, reason: 'expired' };
    if (c.maxUses > 0 && c.usedCount >= c.maxUses) return { ok: false, reason: 'used_up' };
    if (c.restrictedToEmail) {
      if (!email || email.toLowerCase().trim() !== c.restrictedToEmail) {
        return { ok: false, reason: 'wrong_email' };
      }
    }
    let appliedDiscountCents: number | undefined;
    if (typeof baseAmountCents === 'number') {
      appliedDiscountCents =
        c.discountType === 'percent'
          ? Math.round((baseAmountCents * c.discountValue) / 100)
          : Math.min(c.discountValue, baseAmountCents);
    }
    return {
      ok: true,
      promoCodeId: c.id,
      discountType: c.discountType,
      discountValue: c.discountValue,
      appliedDiscountCents,
    };
  }

  async redeem(input: {
    promoCodeId: string;
    siteId?: string | null;
    email?: string | null;
    userId?: string | null;
    guestId?: string | null;
    paymentId?: string | null;
    appliedDiscountCents: number;
  }): Promise<void> {
    await this.reds.save(
      this.reds.create({
        siteId: input.siteId ?? null,
        promoCodeId: input.promoCodeId,
        email: input.email ?? null,
        userId: input.userId ?? null,
        guestId: input.guestId ?? null,
        paymentId: input.paymentId ?? null,
        appliedDiscountCents: input.appliedDiscountCents,
      }),
    );
    await this.codes.increment({ id: input.promoCodeId }, 'usedCount', 1);
  }

  async stats(promoCodeId: string) {
    const c = await this.codes.findOne({ where: { id: promoCodeId } });
    if (!c) throw new NotFoundException('Promo not found');
    const redemptions = await this.reds.find({
      where: { promoCodeId: c.id },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return { promo: c, redemptions };
  }

  /** Codul e unic pe (siteId, code). Pentru request fără siteId (rar — fallback admin)
   *  cădem pe căutare globală pe code. */
  private scopedCodeWhere(code: string, siteId: string | null): FindOptionsWhere<PromoCode> {
    return siteId ? { code, siteId } : { code };
  }
}
