import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThan, Repository } from 'typeorm';
import { RouletteSpin } from './roulette-spin.entity';
import { PromoService } from '../promo/promo.service';

/**
 * Roata norocului — distribuție stochastică.
 * weight = probabilitate (sumă = 100). prize = ce primește user-ul.
 */
const PRIZES = [
  { idx: 0, weight: 50, label: 'Mai noroc data viitoare', kind: 'none' as const },
  { idx: 1, weight: 25, label: '5 lei reducere', kind: 'discount' as const, discountCents: 500 },
  { idx: 2, weight: 15, label: '10 lei reducere', kind: 'discount' as const, discountCents: 1000 },
  { idx: 3, weight: 8,  label: '20 lei reducere', kind: 'discount' as const, discountCents: 2000 },
  { idx: 4, weight: 2,  label: 'Manea GRATIS — 100% off', kind: 'discount' as const, discountCents: 9999 /* effective ~max */ },
];

const COOLDOWN_DAYS = 7;

@Injectable()
export class RouletteService {
  private readonly logger = new Logger('RouletteService');

  constructor(
    @InjectRepository(RouletteSpin) private readonly spins: Repository<RouletteSpin>,
    private readonly promo: PromoService,
  ) {}

  /** Definiția premiilor (pentru frontend să afișeze segmente). */
  getPrizes() {
    return PRIZES.map((p) => ({
      idx: p.idx,
      weight: p.weight,
      label: p.label,
      kind: p.kind,
    }));
  }

  /**
   * Verifică dacă user/guest poate roti acum (cooldown).
   */
  async canSpin(ctx: {
    userId: string | null;
    guestId: string | null;
    siteId: string | null;
  }): Promise<{ ok: boolean; nextSpinAt?: Date }> {
    if (!ctx.userId && !ctx.guestId) return { ok: false };
    const since = new Date(Date.now() - COOLDOWN_DAYS * 86_400_000);
    // Cooldown-ul e per-site: un user RO care a rotit pe RO nu e blocat pe BG.
    const baseWhere = ctx.userId
      ? { userId: ctx.userId, createdAt: MoreThan(since) }
      : { guestId: ctx.guestId!, createdAt: MoreThan(since) };
    const where = ctx.siteId ? { ...baseWhere, siteId: ctx.siteId } : baseWhere;
    const last = await this.spins.findOne({ where, order: { createdAt: 'DESC' } });
    if (!last) return { ok: true };
    const nextSpinAt = new Date(last.createdAt.getTime() + COOLDOWN_DAYS * 86_400_000);
    return { ok: false, nextSpinAt };
  }

  async spin(ctx: {
    userId: string | null;
    guestId: string | null;
    email?: string;
    siteId: string | null;
  }): Promise<{
    prizeIndex: number;
    prizeLabel: string;
    code?: string | null;
    discountCents?: number;
  }> {
    const eligible = await this.canSpin(ctx);
    if (!eligible.ok) {
      throw new ConflictException(
        `Cooldown — încearcă din ${eligible.nextSpinAt?.toISOString() ?? 'curând'}`,
      );
    }

    const prize = pickWeighted(PRIZES);

    let promoCodeId: string | null = null;
    let awardedCode: string | null = null;

    if (prize.kind === 'discount') {
      // Pentru "Manea GRATIS" folosim discount tip percent 100
      const isFree = prize.label.includes('GRATIS');
      const promo = await this.promo.create({
        siteId: ctx.siteId,
        discountType: isFree ? 'percent' : 'fixed',
        discountValue: isFree ? 100 : prize.discountCents,
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 30 * 86_400_000),
        maxUses: 1,
        restrictedToEmail: ctx.email ?? null,
        note: `Roata norocului #${prize.idx} (${prize.label})`,
      });
      promoCodeId = promo.id;
      awardedCode = promo.code;
    }

    const saved = await this.spins.save(
      this.spins.create({
        siteId: ctx.siteId,
        userId: ctx.userId,
        guestId: ctx.userId ? null : ctx.guestId,
        prizeIndex: prize.idx,
        prizeLabel: prize.label,
        awardedPromoCodeId: promoCodeId,
        awardedCode,
      }),
    );
    this.logger.log(`spin ${saved.id} → prize #${prize.idx} (${prize.label}) code=${awardedCode ?? '-'}`);

    return {
      prizeIndex: prize.idx,
      prizeLabel: prize.label,
      code: awardedCode,
      discountCents: prize.kind === 'discount' ? prize.discountCents : undefined,
    };
  }
}

function pickWeighted<T extends { weight: number }>(pool: T[]): T {
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of pool) {
    if (r < p.weight) return p;
    r -= p.weight;
  }
  return pool[pool.length - 1];
}
