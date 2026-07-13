import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingCustomer } from './billing-customer.entity';
import { resolveLocalityForSmartbill } from '../../common/ro-locality.util';

/** Câmpurile editabile ale unui profil de client (autosave inline). */
export interface BillingCustomerPatch {
  name?: string | null;
  vatCode?: string | null;
  regCom?: string | null;
  address?: string | null;
  city?: string | null;
  county?: string | null;
  country?: string | null;
  phone?: string | null;
  isTaxPayer?: boolean;
  notes?: string | null;
}

/** Un rând din lista de clienți: datele efective + statistici agregate. */
export interface BillingCustomerRow {
  siteId: string | null;
  email: string;
  /** Numele efectiv: cel salvat, altfel cel mai recent nume din plăți. */
  name: string | null;
  vatCode: string | null;
  regCom: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  country: string | null;
  phone: string | null;
  isTaxPayer: boolean;
  notes: string | null;
  /** id-ul override-ului salvat (null dacă rândul e doar derivat din plăți). */
  savedId: string | null;
  /** true dacă există un profil salvat (editat manual). */
  saved: boolean;
  ordersPaid: number;
  ordersTotal: number;
  paidTotalRonCents: number;
  invoicesCount: number;
  lastOrderAt: string | null;
}

interface AggRow {
  email: string;
  site_id: string | null;
  orders_paid: string | number;
  orders_total: string | number;
  paid_total_ron: string | number;
  last_order_at: Date | string | null;
  derived_name: string | null;
  derived_address: string | null;
  derived_city: string | null;
  derived_county: string | null;
  derived_postal: string | null;
  derived_country: string | null;
  derived_phone: string | null;
}

/** Cod țară ISO → denumire prietenoasă (doar pentru afișare). */
function mapCountryName(code: string | null): string | null {
  if (!code) return null;
  const c = code.trim();
  if (!c) return null;
  if (c.toUpperCase() === 'RO' || c.toLowerCase() === 'romania') return 'Romania';
  return c;
}

@Injectable()
export class BillingCustomersService {
  constructor(
    @InjectRepository(BillingCustomer)
    private readonly repo: Repository<BillingCustomer>,
  ) {}

  static normalizeEmail(email?: string | null): string | null {
    const e = (email ?? '').trim().toLowerCase();
    return e || null;
  }

  /**
   * Subquery care agregă clienții din `payments` (grup pe email normalizat + site).
   * Emailul = COALESCE(customerEmail din Stripe, email user, email guest).
   */
  private static readonly AGG_SUBQUERY = `
    SELECT
      LOWER(COALESCE(NULLIF(p."customerEmail", ''), u.email, g.email)) AS email,
      p."siteId" AS site_id,
      COUNT(*) FILTER (WHERE p.status = 'paid') AS orders_paid,
      COUNT(*) AS orders_total,
      COALESCE(SUM(
        CASE
          WHEN p."amountRonCents" IS NOT NULL THEN p."amountRonCents"
          WHEN upper(p.currency) = 'RON' THEN p.amount
          WHEN p."exchangeRateToRon" IS NOT NULL THEN round(p.amount * p."exchangeRateToRon")::int
          ELSE round(p.amount * 5.23)::int
        END
      ) FILTER (WHERE p.status = 'paid'), 0) AS paid_total_ron,
      MAX(p."createdAt") AS last_order_at,
      (ARRAY_AGG(p."customerName" ORDER BY p."createdAt" DESC)
        FILTER (WHERE p."customerName" IS NOT NULL AND p."customerName" <> ''))[1] AS derived_name,
      (ARRAY_AGG(p."billingAddress" ORDER BY p."createdAt" DESC)
        FILTER (WHERE p."billingAddress" IS NOT NULL AND p."billingAddress" <> ''))[1] AS derived_address,
      (ARRAY_AGG(p."billingCity" ORDER BY p."createdAt" DESC)
        FILTER (WHERE p."billingCity" IS NOT NULL AND p."billingCity" <> ''))[1] AS derived_city,
      (ARRAY_AGG(p."billingCounty" ORDER BY p."createdAt" DESC)
        FILTER (WHERE p."billingCounty" IS NOT NULL AND p."billingCounty" <> ''))[1] AS derived_county,
      (ARRAY_AGG(p."billingPostalCode" ORDER BY p."createdAt" DESC)
        FILTER (WHERE p."billingPostalCode" IS NOT NULL AND p."billingPostalCode" <> ''))[1] AS derived_postal,
      (ARRAY_AGG(p."billingCountry" ORDER BY p."createdAt" DESC)
        FILTER (WHERE p."billingCountry" IS NOT NULL AND p."billingCountry" <> ''))[1] AS derived_country,
      (ARRAY_AGG(p."billingPhone" ORDER BY p."createdAt" DESC)
        FILTER (WHERE p."billingPhone" IS NOT NULL AND p."billingPhone" <> ''))[1] AS derived_phone
    FROM payments p
    LEFT JOIN users u ON u.id = p."userId"
    LEFT JOIN guest_sessions g ON g.id = p."guestId"
    WHERE COALESCE(NULLIF(p."customerEmail", ''), u.email, g.email) IS NOT NULL
      AND ($1::uuid IS NULL OR p."siteId" = $1::uuid)
    GROUP BY LOWER(COALESCE(NULLIF(p."customerEmail", ''), u.email, g.email)), p."siteId"
  `;

  /** Lista paginată de clienți cu statistici + override-uri salvate. */
  async listCustomers(
    siteId: string | null,
    opts: { limit: number; offset: number; search?: string | null },
  ): Promise<{ items: BillingCustomerRow[]; total: number }> {
    const limit = Math.min(Math.max(opts.limit || 50, 1), 200);
    const offset = Math.max(opts.offset || 0, 0);
    const search = opts.search?.trim() ? `%${opts.search.trim()}%` : null;
    const sub = BillingCustomersService.AGG_SUBQUERY;

    const totalRes: Array<{ total: number }> = await this.repo.query(
      `SELECT COUNT(*)::int AS total FROM (${sub}) c
        WHERE ($2::text IS NULL OR c.email ILIKE $2 OR c.derived_name ILIKE $2)`,
      [siteId, search],
    );
    const total = totalRes[0]?.total ?? 0;

    const rows: AggRow[] = await this.repo.query(
      `SELECT * FROM (${sub}) c
        WHERE ($2::text IS NULL OR c.email ILIKE $2 OR c.derived_name ILIKE $2)
        ORDER BY c.last_order_at DESC NULLS LAST
        LIMIT $3 OFFSET $4`,
      [siteId, search, limit, offset],
    );

    if (rows.length === 0) return { items: [], total };

    // Perechile (siteId, email) din pagină → lookup override-uri salvate + nr. facturi.
    const emails = Array.from(new Set(rows.map((r) => r.email)));
    const siteIds = Array.from(
      new Set(rows.map((r) => r.site_id).filter((s): s is string => !!s)),
    );

    const savedList: BillingCustomer[] = siteIds.length
      ? await this.repo
          .createQueryBuilder('bc')
          .where('bc.siteId IN (:...siteIds)', { siteIds })
          .andWhere('bc.email IN (:...emails)', { emails })
          .getMany()
      : [];
    const savedByKey = new Map<string, BillingCustomer>();
    for (const s of savedList) savedByKey.set(`${s.siteId}|${s.email}`, s);

    const invCounts: Array<{ site_id: string; email: string; cnt: number }> =
      siteIds.length
        ? await this.repo.query(
            `SELECT p."siteId" AS site_id,
                    LOWER(COALESCE(NULLIF(p."customerEmail", ''), u.email, g.email)) AS email,
                    COUNT(*)::int AS cnt
               FROM invoices inv
               JOIN payments p ON p.id = inv."paymentId"
               LEFT JOIN users u ON u.id = p."userId"
               LEFT JOIN guest_sessions g ON g.id = p."guestId"
              WHERE inv.status = 'issued'
                AND p."siteId" = ANY($1::uuid[])
                AND LOWER(COALESCE(NULLIF(p."customerEmail", ''), u.email, g.email)) = ANY($2::text[])
              GROUP BY p."siteId", LOWER(COALESCE(NULLIF(p."customerEmail", ''), u.email, g.email))`,
            [siteIds, emails],
          )
        : [];
    const invByKey = new Map<string, number>();
    for (const r of invCounts) invByKey.set(`${r.site_id}|${r.email}`, r.cnt);

    const items: BillingCustomerRow[] = rows.map((r) => {
      const key = `${r.site_id}|${r.email}`;
      const saved = savedByKey.get(key) ?? null;
      // Județ = DOAR RO valid (sau București → „Sector N"); localitate străină/invalidă
      // → județ gol. Consistent cu ce se trimite pe factură.
      const loc = resolveLocalityForSmartbill({
        city: r.derived_city,
        county: r.derived_county,
        address: r.derived_address,
        postalCode: r.derived_postal,
      });
      return {
        siteId: r.site_id,
        email: r.email,
        name: saved?.name ?? r.derived_name ?? null,
        vatCode: saved?.vatCode ?? null,
        regCom: saved?.regCom ?? null,
        address: saved?.address ?? r.derived_address ?? null,
        city: saved?.city ?? loc.city ?? null,
        county: saved?.county ?? loc.county ?? null,
        country: saved?.country ?? mapCountryName(r.derived_country) ?? null,
        phone: saved?.phone ?? r.derived_phone ?? null,
        isTaxPayer: saved?.isTaxPayer ?? false,
        notes: saved?.notes ?? null,
        savedId: saved?.id ?? null,
        saved: !!saved,
        ordersPaid: Number(r.orders_paid) || 0,
        ordersTotal: Number(r.orders_total) || 0,
        paidTotalRonCents: Number(r.paid_total_ron) || 0,
        invoicesCount: invByKey.get(key) ?? 0,
        lastOrderAt: r.last_order_at
          ? new Date(r.last_order_at).toISOString()
          : null,
      };
    });

    return { items, total };
  }

  /** Upsert pe (siteId, email) — ținta autosave-ului inline. */
  async upsert(
    siteId: string | null,
    email: string | null,
    patch: BillingCustomerPatch,
  ): Promise<BillingCustomer> {
    const normEmail = BillingCustomersService.normalizeEmail(email);
    if (!normEmail) throw new BadRequestException('Email client lipsă');
    if (!siteId) throw new BadRequestException('Site lipsă pentru client');

    let row = await this.repo.findOne({ where: { siteId, email: normEmail } });
    if (!row) {
      row = this.repo.create({ siteId, email: normEmail, isTaxPayer: false });
    }
    // Aplicăm doar câmpurile trimise (trim la string-uri, gol → null).
    const clean = (v: string | null): string | null => {
      const t = (v ?? '').trim();
      return t || null;
    };
    if (patch.name !== undefined) row.name = clean(patch.name);
    if (patch.vatCode !== undefined) row.vatCode = clean(patch.vatCode);
    if (patch.regCom !== undefined) row.regCom = clean(patch.regCom);
    if (patch.address !== undefined) row.address = clean(patch.address);
    if (patch.city !== undefined) row.city = clean(patch.city);
    if (patch.county !== undefined) row.county = clean(patch.county);
    if (patch.country !== undefined) row.country = clean(patch.country);
    if (patch.phone !== undefined) row.phone = clean(patch.phone);
    if (patch.notes !== undefined) row.notes = clean(patch.notes);
    if (patch.isTaxPayer !== undefined) row.isTaxPayer = !!patch.isTaxPayer;

    return this.repo.save(row);
  }

  /** Șterge override-ul (rândul revine la datele derivate din plăți). */
  async reset(id: string): Promise<{ ok: true; id: string }> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Client negăsit');
    await this.repo.delete({ id });
    return { ok: true, id };
  }

  /** Override salvat pentru (siteId, email) — folosit de InvoicesService. */
  async findOverride(
    siteId: string | null,
    email: string | null,
  ): Promise<BillingCustomer | null> {
    const normEmail = BillingCustomersService.normalizeEmail(email);
    if (!siteId || !normEmail) return null;
    return this.repo.findOne({ where: { siteId, email: normEmail } });
  }
}
