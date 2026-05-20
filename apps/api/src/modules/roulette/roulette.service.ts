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
import { SitesService } from '../sites/sites.service';

/**
 * Cheile stabile pentru cele 5 segmente ale roții. UI-ul folosește cheia ca să
 * traducă label-ul corespunzător pe limba site-ului.
 */
export type PrizeKey = 'ghinion' | 'tier1' | 'tier2' | 'tier3' | 'gratis';

/**
 * Roata norocului — distribuție stochastică.
 * weight = probabilitate proporțională. Suma nu trebuie să fie 100 — pickWeighted
 * normalizează intern.
 *
 * NOTĂ business: doar `ghinion` (nimic) și `tier1` (cel mai mic discount) sunt
 * active matematic. tier2, tier3 și gratis au weight 0 → nu pot pica niciodată.
 * Le păstrăm pe wheel pentru atracție vizuală, dar utilizatorul nu le va lua.
 */
const PRIZES = [
  { idx: 0, weight: 50, prizeKey: 'ghinion' as PrizeKey, kind: 'none' as const },
  { idx: 1, weight: 25, prizeKey: 'tier1' as PrizeKey, kind: 'discount' as const },
  { idx: 2, weight: 0, prizeKey: 'tier2' as PrizeKey, kind: 'discount' as const },
  { idx: 3, weight: 0, prizeKey: 'tier3' as PrizeKey, kind: 'discount' as const },
  { idx: 4, weight: 0, prizeKey: 'gratis' as PrizeKey, kind: 'discount' as const },
];

/**
 * Cuantum-uri în cei mai mici subdiviziuni (cents) pentru fiecare tier și
 * monedă. Echivalente aproximative cu 5/10/20 RON folosind ratele uzuale.
 *
 * Dacă moneda site-ului nu apare aici, folosim default RON.
 */
const TIER_AMOUNTS_BY_CURRENCY: Record<
  string,
  { tier1: number; tier2: number; tier3: number }
> = {
  RON: { tier1: 500, tier2: 1000, tier3: 2000 }, // 5 / 10 / 20 lei
  EUR: { tier1: 100, tier2: 200, tier3: 400 }, // 1 / 2 / 4 €
  BGN: { tier1: 200, tier2: 400, tier3: 800 }, // 2 / 4 / 8 лв.
  RSD: { tier1: 12000, tier2: 24000, tier3: 48000 }, // 120 / 240 / 480 дин.
  TRY: { tier1: 4000, tier2: 8000, tier3: 16000 }, // 40 / 80 / 160 ₺
  HUF: { tier1: 40000, tier2: 80000, tier3: 160000 }, // 400 / 800 / 1600 Ft
  BAM: { tier1: 200, tier2: 400, tier3: 800 }, // 2 / 4 / 8 KM (paritate 1:1 cu EUR ÷ ~2)
};

function tierAmounts(currency: string | null | undefined) {
  return TIER_AMOUNTS_BY_CURRENCY[currency ?? 'RON'] ?? TIER_AMOUNTS_BY_CURRENCY.RON;
}

const COOLDOWN_DAYS = 7;

@Injectable()
export class RouletteService {
  private readonly logger = new Logger('RouletteService');

  constructor(
    @InjectRepository(RouletteSpin) private readonly spins: Repository<RouletteSpin>,
    private readonly promo: PromoService,
    private readonly sites: SitesService,
  ) {}

  /**
   * Definiția premiilor pentru frontend — include cheia stabilă (ca să poată
   * fi tradusă) și sumele în cents per-currency.
   */
  async getPrizes(siteId: string | null) {
    const currency = siteId ? (await this.sites.findById(siteId))?.currency ?? 'RON' : 'RON';
    const amounts = tierAmounts(currency);
    return PRIZES.map((p) => ({
      idx: p.idx,
      weight: p.weight,
      prizeKey: p.prizeKey,
      kind: p.kind,
      discountCents:
        p.prizeKey === 'tier1'
          ? amounts.tier1
          : p.prizeKey === 'tier2'
            ? amounts.tier2
            : p.prizeKey === 'tier3'
              ? amounts.tier3
              : null,
      currency,
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
    prizeKey: PrizeKey;
    code?: string | null;
    discountCents?: number;
    currency?: string;
  }> {
    const eligible = await this.canSpin(ctx);
    if (!eligible.ok) {
      throw new ConflictException(
        `Cooldown — încearcă din ${eligible.nextSpinAt?.toISOString() ?? 'curând'}`,
      );
    }

    const site = ctx.siteId ? await this.sites.findById(ctx.siteId) : null;
    const currency = site?.currency ?? 'RON';
    const amounts = tierAmounts(currency);

    // Pickerul ignoră intrările cu weight 0 (tier3 și gratis sunt inactive).
    const prize = pickWeighted(PRIZES);

    let promoCodeId: string | null = null;
    let awardedCode: string | null = null;
    let discountCents: number | undefined;

    if (prize.kind === 'discount') {
      // Calculează valoarea efectivă în cents per currency curent.
      if (prize.prizeKey === 'tier1') discountCents = amounts.tier1;
      else if (prize.prizeKey === 'tier2') discountCents = amounts.tier2;
      else if (prize.prizeKey === 'tier3') discountCents = amounts.tier3;
      // 'gratis' = 100% discount (percent), n-are sens să dăm cents.

      const isFree = prize.prizeKey === 'gratis';
      const promo = await this.promo.create({
        siteId: ctx.siteId,
        discountType: isFree ? 'percent' : 'fixed',
        discountValue: isFree ? 100 : (discountCents ?? 0),
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 30 * 86_400_000),
        maxUses: 1,
        restrictedToEmail: ctx.email ?? null,
        note: `Roata norocului #${prize.idx} (${prize.prizeKey} / ${currency})`,
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
        // Stocăm cheia ca audit-friendly label (nu mai e localizat).
        prizeLabel: prize.prizeKey,
        awardedPromoCodeId: promoCodeId,
        awardedCode,
      }),
    );
    this.logger.log(
      `spin ${saved.id} → ${prize.prizeKey} (${currency}) code=${awardedCode ?? '-'}`,
    );

    return {
      prizeIndex: prize.idx,
      prizeKey: prize.prizeKey,
      code: awardedCode,
      discountCents,
      currency,
    };
  }
}

function pickWeighted<T extends { weight: number }>(pool: T[]): T {
  const total = pool.reduce((s, p) => s + p.weight, 0);
  if (total <= 0) {
    // Toate weight-urile sunt 0 — defensive: returnează primul (n-ar trebui să se întâmple).
    return pool[0];
  }
  let r = Math.random() * total;
  for (const p of pool) {
    if (p.weight <= 0) continue;
    if (r < p.weight) return p;
    r -= p.weight;
  }
  // Fallback: ultima intrare cu weight > 0.
  for (let i = pool.length - 1; i >= 0; i--) {
    if (pool[i].weight > 0) return pool[i];
  }
  return pool[0];
}
