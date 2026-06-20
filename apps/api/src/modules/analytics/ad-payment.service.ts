import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AdPayment, AdPaymentType } from './ad-payment.entity';
import { AdSpend, AdPlatform } from './ad-spend.entity';

export interface AdPaymentInput {
  platform?: AdPlatform;
  type: AdPaymentType;
  amountCents: number;
  currency: string;
  date: string;
  reference?: string | null;
  note?: string | null;
}

function toDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Semnul cu care fiecare tip intră în netul plătit către platformă. */
function signFor(type: AdPaymentType): 1 | -1 {
  return type === 'refund' ? -1 : 1;
}

@Injectable()
export class AdPaymentService {
  constructor(
    @InjectRepository(AdPayment) private readonly repo: Repository<AdPayment>,
    @InjectRepository(AdSpend) private readonly spend: Repository<AdSpend>,
  ) {}

  // ============== CRUD ==============

  async list(siteId: string | null, platform: AdPlatform = 'meta'): Promise<AdPayment[]> {
    const qb = this.repo
      .createQueryBuilder('p')
      .where('p.platform = :platform', { platform })
      .orderBy('p.date', 'DESC')
      .addOrderBy('p.createdAt', 'DESC');
    if (siteId) qb.andWhere('p.siteId = :siteId', { siteId });
    return qb.getMany();
  }

  async create(
    siteId: string | null,
    input: AdPaymentInput,
    createdByEmail: string | null,
  ): Promise<AdPayment> {
    const row = this.repo.create({
      siteId: siteId ?? null,
      platform: input.platform ?? 'meta',
      type: input.type,
      amountCents: Math.abs(Math.round(input.amountCents)),
      currency: (input.currency || 'RON').toUpperCase(),
      date: input.date,
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
      createdByEmail,
    });
    return this.repo.save(row);
  }

  async update(
    id: string,
    siteId: string | null,
    input: Partial<AdPaymentInput>,
  ): Promise<AdPayment> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Plată negăsită');
    // Admin pe site specific nu poate edita plata altui site.
    if (siteId && row.siteId && row.siteId !== siteId) {
      throw new NotFoundException('Plată negăsită');
    }
    if (input.type != null) row.type = input.type;
    if (input.amountCents != null) row.amountCents = Math.abs(Math.round(input.amountCents));
    if (input.currency != null) row.currency = (input.currency || 'RON').toUpperCase();
    if (input.date != null) row.date = input.date;
    if (input.reference !== undefined) row.reference = input.reference?.trim() || null;
    if (input.note !== undefined) row.note = input.note?.trim() || null;
    if (input.platform != null) row.platform = input.platform;
    return this.repo.save(row);
  }

  async remove(id: string, siteId: string | null): Promise<void> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Plată negăsită');
    if (siteId && row.siteId && row.siteId !== siteId) {
      throw new NotFoundException('Plată negăsită');
    }
    await this.repo.remove(row);
  }

  // ============== RECONCILIERE ==============

  /**
   * Compară banii REALI plătiți (din `ad_payment`) cu CONSUMUL raportat de
   * platformă (din `ad_spend`), pentru o platformă (Meta).
   *
   * **Totul e ALL-TIME, intenționat** — NU depinde de intervalul selectat în
   * analitice. Plățile sunt punctuale (alimentezi contul rar, cu sume mari), iar
   * consumul e zilnic; a le compara pe o fereastră îngustă ar fi înșelător (0
   * plătit în interval vs. consum zilnic ⇒ pare permanent „în pierdere"). Soldul
   * = tot ce ai plătit (net) − tot ce s-a consumat = „cât mai ai în cont la Meta".
   * Corect doar dacă ai înregistrat toate plățile și `ad_spend` e sincronizat
   * complet — de aici `balanceReliable`.
   *
   * Reconcilierea se face în moneda dominantă a contului de ads (cea mai frecventă
   * monedă din `ad_spend`); plățile în alte monede sunt semnalate prin `mixedCurrencies`.
   */
  async reconciliation(siteId: string | null, platform: AdPlatform = 'meta') {
    // --- Moneda de reconciliere = moneda dominantă a spend-ului (după volum) ---
    const curQb = this.spend
      .createQueryBuilder('a')
      .select('a.currency', 'currency')
      .addSelect('SUM(a.spendCents)::bigint', 'total')
      .where('a.platform = :platform', { platform })
      .groupBy('a.currency')
      .orderBy('total', 'DESC');
    if (siteId) curQb.andWhere('a.siteId = :siteId', { siteId });
    const curRows = await curQb.getRawMany<{ currency: string; total: string }>();

    // Fallback pe moneda celei mai recente plăți dacă nu există spend deloc.
    let currency = curRows[0]?.currency ?? null;
    if (!currency) {
      const lastPay = await this.list(siteId, platform);
      currency = lastPay[0]?.currency ?? 'RON';
    }

    // --- Plăți (net) all-time, în moneda de reconciliere ---
    const payAll = await this.sumPayments({ siteId, platform, currency });

    // Plăți într-o altă monedă decât cea de reconciliere → avertizăm UI.
    const payOther = await this.repo
      .createQueryBuilder('p')
      .select('COUNT(*)::int', 'count')
      .where('p.platform = :platform', { platform })
      .andWhere('p.currency != :currency', { currency })
      .andWhere(siteId ? 'p.siteId = :siteId' : '1=1', siteId ? { siteId } : {})
      .getRawOne<{ count: number }>();
    const mixedCurrencies = (payOther?.count ?? 0) > 0;

    // --- Spend (consum) all-time, în aceeași monedă ---
    const spentAll = await this.sumSpend({ siteId, platform, currency });

    const balanceCents = payAll.netCents - spentAll;
    // Soldul e „de încredere" doar dacă există atât plăți, cât și spend înregistrat.
    const balanceReliable = payAll.netCents > 0 && spentAll > 0;

    return {
      currency,
      mixedCurrencies,
      totalPaidCents: payAll.netCents,
      totalSpentCents: spentAll,
      balanceCents,
      balanceReliable,
      // Defalcare plăți pe tip (moneda de reconciliere) pentru context.
      byType: payAll.byType,
    };
  }

  // ============== HELPERS ==============

  private async sumPayments(args: {
    siteId: string | null;
    platform: AdPlatform;
    currency: string;
    fromDay?: string;
    toDay?: string;
  }): Promise<{ netCents: number; byType: Record<AdPaymentType, number> }> {
    const qb = this.repo
      .createQueryBuilder('p')
      .select('p.type', 'type')
      .addSelect('SUM(p.amountCents)::bigint', 'sum')
      .where('p.platform = :platform', { platform: args.platform })
      .andWhere('p.currency = :currency', { currency: args.currency })
      .groupBy('p.type');
    if (args.siteId) qb.andWhere('p.siteId = :siteId', { siteId: args.siteId });
    if (args.fromDay && args.toDay) {
      qb.andWhere('p.date BETWEEN :from AND :to', { from: args.fromDay, to: args.toDay });
    }
    const rows = await qb.getRawMany<{ type: AdPaymentType; sum: string }>();
    const byType: Record<AdPaymentType, number> = { fund_loading: 0, payment: 0, refund: 0 };
    let netCents = 0;
    for (const r of rows) {
      const v = parseInt(r.sum, 10) || 0;
      byType[r.type] = v;
      netCents += signFor(r.type) * v;
    }
    return { netCents, byType };
  }

  private async sumSpend(args: {
    siteId: string | null;
    platform: AdPlatform;
    currency: string;
    fromDay?: string;
    toDay?: string;
  }): Promise<number> {
    const qb = this.spend
      .createQueryBuilder('a')
      .select('COALESCE(SUM(a.spendCents), 0)::bigint', 'sum')
      .where('a.platform = :platform', { platform: args.platform })
      .andWhere('a.currency = :currency', { currency: args.currency });
    if (args.siteId) qb.andWhere('a.siteId = :siteId', { siteId: args.siteId });
    if (args.fromDay && args.toDay) {
      qb.andWhere('a.date BETWEEN :from AND :to', { from: args.fromDay, to: args.toDay });
    }
    const row = await qb.getRawOne<{ sum: string }>();
    return parseInt(row?.sum ?? '0', 10) || 0;
  }
}
