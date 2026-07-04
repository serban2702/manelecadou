import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { In, IsNull, Repository } from 'typeorm';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Invoice, InvoiceClientSnapshot } from './invoice.entity';
import { Payment } from '../payments/payment.entity';
import { User } from '../users/user.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { BillingCustomer } from '../billing-customers/billing-customer.entity';
import { Site, SiteSmartbill } from '../sites/site.entity';
import { SitesService } from '../sites/sites.service';
import { PaymentsService } from '../payments/payments.service';
import { decryptSecret } from '../../common/crypto.util';
import { normalizeCounty, resolveLocalityForSmartbill } from '../../common/ro-locality.util';
import {
  SmartbillClient,
  SmartbillCredentials,
  SmartbillInvoiceInput,
} from './smartbill.client';

/** Datele editabile trimise din preview la emitere. */
export interface EmitOverrides {
  client?: InvoiceClientSnapshot;
  productName?: string;
  /** Preț unitar în RON (zecimal). Dacă lipsește, se ia din plată. */
  price?: number;
  paymentType?: string;
  /** Data emiterii YYYY-MM-DD. Default azi. */
  issueDate?: string;
  observations?: string;
}

/** Rezultatul emiterii unei singure facturi într-un job bulk. */
export interface BulkEmitResult {
  paymentId: string;
  ok: boolean;
  error?: string;
  invoiceId?: string;
}

/** Starea unui job de emitere în bloc (async + polling). */
export interface BulkEmitJob {
  id: string;
  total: number;
  done: number;
  ok: number;
  failed: number;
  status: 'running' | 'done';
  results: BulkEmitResult[];
  startedAt: number;
  finishedAt: number | null;
}

export interface BillableRow {
  paymentId: string;
  siteId: string | null;
  amountCents: number;
  currency: string;
  createdAt: Date;
  buyerName: string | null;
  buyerEmail: string | null;
  /** Clientul cu care s-ar emite factura (respectă useDefaultClient + județ
   *  normalizat). Editabil în modalul de emitere. */
  client: InvoiceClientSnapshot;
  /** 'failed' dacă a existat o încercare anterioară eșuată; 'none' altfel.
   *  (Cele cu factură 'issued' nu apar în listă, prin definiție.) */
  invoiceStatus: 'none' | 'failed';
  smartbillReady: boolean;
}

/** Denumirea liniei de produs pe factură (neplătitor TVA, cotă 0%). */
export const DEFAULT_PRODUCT_NAME = 'Melodie personalizată generată cu AI';

/** Tipul de plată implicit trimis la SmartBill (plățile vin din Stripe/card online). */
export const DEFAULT_PAYMENT_TYPE = 'Card online';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  /** Joburi de emitere în bloc, in-memory (single-instance API). */
  private readonly bulkJobs = new Map<string, BulkEmitJob>();

  constructor(
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(GuestSession) private readonly guests: Repository<GuestSession>,
    @InjectRepository(BillingCustomer)
    private readonly billingCustomers: Repository<BillingCustomer>,
    private readonly sites: SitesService,
    private readonly smartbill: SmartbillClient,
    private readonly paymentsSvc: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  /** Mapează codul de țară ISO (ex. „RO") la denumirea cerută de SmartBill. */
  private mapCountry(code?: string | null): string {
    if (!code) return 'Romania';
    const c = code.trim();
    if (c.toUpperCase() === 'RO' || c.toLowerCase() === 'romania') return 'Romania';
    return c;
  }

  /** Datele de plătitor din Stripe (nume + adresă din billing). Best-effort. */
  private async stripeDetails(paymentId: string) {
    try {
      return await this.paymentsSvc.fetchStripeCustomerDetails(paymentId);
    } catch {
      return null;
    }
  }

  /** Emailul cumpărătorului din DB (user sau guest). */
  private async buyerEmail(p: Payment): Promise<string | null> {
    if (p.userId) {
      const u = await this.users.findOne({ where: { id: p.userId } });
      if (u?.email) return u.email;
    }
    if (p.guestId) {
      const g = await this.guests.findOne({ where: { id: p.guestId } });
      if (g?.email) return g.email;
    }
    return null;
  }

  private uploadsDir(): string {
    return this.config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads');
  }

  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Configul SmartBill al unui site cu tokenul DECRIPTAT. Null dacă neconfigurat. */
  private resolveCreds(sb: SiteSmartbill | undefined): SmartbillCredentials | null {
    if (!sb?.email || !sb.token) return null;
    let token: string;
    try {
      token = decryptSecret(sb.token);
    } catch {
      return null;
    }
    if (!token) return null;
    return { email: sb.email, token };
  }

  /** Plățile facturabile: paid, sumă > 0, fără factură emisă și nemarcate manual. */
  async listBillable(siteId: string | null): Promise<BillableRow[]> {
    const qb = this.payments
      .createQueryBuilder('p')
      .leftJoin(
        Invoice,
        'inv',
        "inv.paymentId = p.id AND inv.status IN ('issued', 'manual')",
      )
      .where('p.status = :status', { status: 'paid' })
      .andWhere('p.amount > 0')
      .andWhere('inv.id IS NULL')
      .orderBy('p.createdAt', 'DESC')
      .limit(500);
    if (siteId) qb.andWhere('p.siteId = :siteId', { siteId });

    const rows = await qb.getMany();
    // Îmbogățim în loturi mici ca să nu lovim rate-limit-ul Stripe (fiecare rând
    // = un retrieve de sesiune Stripe pentru numele real al plătitorului).
    const out: BillableRow[] = [];
    const CHUNK = 8;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const enriched = await Promise.all(slice.map((p) => this.enrichPayment(p)));
      out.push(...enriched);
    }
    // Marcăm plățile cu o emitere anterioară eșuată (factură status='failed'),
    // ca să se vadă în coloana „Facturat" din tab-ul „De facturat".
    const ids = out.map((r) => r.paymentId);
    if (ids.length) {
      const failed = await this.invoices.find({
        where: { paymentId: In(ids), status: 'failed' },
        select: ['paymentId'],
      });
      const failedSet = new Set(failed.map((f) => f.paymentId));
      for (const r of out) if (failedSet.has(r.paymentId)) r.invoiceStatus = 'failed';
    }
    return out;
  }

  private async enrichPayment(p: Payment): Promise<BillableRow> {
    const site = p.siteId ? await this.sites.findById(p.siteId) : null;
    const creds = this.resolveCreds(site?.smartbill);
    // Emailul + numele vin din coloanele plății (Stripe persistat la webhook/backfill)
    // sau din DB — FĂRĂ fetch Stripe per rând (era cauza lentorii la /facturare).
    const email = p.customerEmail ?? (await this.buyerEmail(p));
    let buyerName = p.customerName ?? null;
    if (!buyerName && p.userId) {
      const u = await this.users.findOne({ where: { id: p.userId } });
      buyerName = u?.name ?? null;
    }
    const client: InvoiceClientSnapshot = site
      ? await this.defaultClientFor(p, site)
      : { country: 'Romania', isTaxPayer: false };
    return {
      paymentId: p.id,
      siteId: p.siteId,
      amountCents: p.amount,
      currency: p.currency,
      createdAt: p.createdAt,
      buyerName,
      buyerEmail: email,
      client,
      invoiceStatus: 'none',
      smartbillReady: !!(site?.smartbill?.enabled && creds),
    };
  }

  /** Facturile emise (sau eșuate), pentru tab-ul „Emise". */
  async listIssued(siteId: string | null): Promise<Invoice[]> {
    const where = siteId ? { siteId } : {};
    return this.invoices.find({
      where,
      order: { createdAt: 'DESC' },
      take: 500,
    });
  }

  /** Construiește datele clientului implicite pentru o plată (preview/emit),
   *  din coloanele plății (adresa Stripe persistată) + override salvat. */
  private async defaultClientFor(
    p: Payment,
    site: Site,
  ): Promise<InvoiceClientSnapshot> {
    const sb = site.smartbill ?? {};
    const email = p.customerEmail ?? (await this.buyerEmail(p));
    if (sb.useDefaultClient && sb.defaultClient?.name) {
      return {
        country: 'Romania',
        isTaxPayer: false,
        ...sb.defaultClient,
        county: normalizeCounty(sb.defaultClient.county) ?? undefined,
      };
    }
    let name = p.customerName ?? '';
    if (!name && p.userId) {
      const u = await this.users.findOne({ where: { id: p.userId } });
      name = u?.name ?? '';
    }
    // Baza derivată din coloanele plății (adresă Stripe persistată la webhook/backfill).
    // Pentru București: județ „Bucuresti" + localitate „Sector N" (din cod poștal/adresă).
    const loc = resolveLocalityForSmartbill({
      city: p.billingCity,
      county: p.billingCounty,
      address: p.billingAddress,
      postalCode: p.billingPostalCode,
    });
    const derived: InvoiceClientSnapshot = {
      name,
      email: email ?? undefined,
      address: p.billingAddress ?? undefined,
      city: loc.city ?? undefined,
      county: loc.county ?? undefined,
      country: this.mapCountry(p.billingCountry),
      isTaxPayer: false,
    };
    // Fallback Stripe (o singură dată, doar la emitere/preview) pentru plăți vechi
    // nesincronizate încă și fără date utile — ca să nu blocheze emiterea.
    if (!p.billingSyncedAt && !derived.address && !derived.city && !derived.name) {
      const stripe = await this.stripeDetails(p.id);
      if (stripe) {
        const a = stripe.address;
        const street = [a?.line1, a?.line2].filter(Boolean).join(', ');
        if (stripe.name) derived.name = stripe.name;
        if (street) derived.address = street;
        if (a?.city || a?.state) {
          const l2 = resolveLocalityForSmartbill({
            city: a?.city,
            county: a?.state,
            address: street,
            postalCode: a?.postalCode,
          });
          derived.city = l2.city ?? undefined;
          derived.county = l2.county ?? undefined;
        }
        if (a?.country) derived.country = this.mapCountry(a.country);
      }
    }
    // Override salvat manual pe client (editat în „Clienți"/„Facturare"). E sursa de
    // adevăr și se aplică la toate facturile viitoare ale acestui cumpărător.
    const override = await this.findBillingOverride(site.id, email);
    // Fallback pe clientul implicit dacă nu avem nici nume, nici override cu nume.
    if (!derived.name && !override?.name && sb.defaultClient?.name) {
      return { country: 'Romania', isTaxPayer: false, ...sb.defaultClient };
    }
    if (!override) return derived;
    // Suprascriem doar câmpurile salvate ne-goale; restul rămân din plată.
    const pick = (v: string | null): string | undefined => {
      const t = (v ?? '').trim();
      return t || undefined;
    };
    return {
      ...derived,
      name: pick(override.name) ?? derived.name,
      vatCode: pick(override.vatCode) ?? derived.vatCode,
      regCom: pick(override.regCom) ?? derived.regCom,
      address: pick(override.address) ?? derived.address,
      city: pick(override.city) ?? derived.city,
      county: normalizeCounty(override.county) ?? derived.county,
      country: pick(override.country) ?? derived.country,
      isTaxPayer: override.isTaxPayer ?? derived.isTaxPayer,
    };
  }

  /** Profilul de facturare salvat pentru (siteId, email), dacă există. */
  private async findBillingOverride(
    siteId: string | null,
    email: string | null,
  ): Promise<BillingCustomer | null> {
    const normEmail = (email ?? '').trim().toLowerCase();
    if (!siteId || !normEmail) return null;
    return this.billingCustomers.findOne({
      where: { siteId, email: normEmail },
    });
  }

  /** Datele de preview pentru o plată (înainte de emitere). */
  async buildPreview(paymentId: string) {
    const p = await this.payments.findOne({ where: { id: paymentId } });
    if (!p) throw new NotFoundException('Plata nu există');
    if (!p.siteId) throw new BadRequestException('Plata nu are site asociat');
    const site = await this.sites.findById(p.siteId);
    if (!site) throw new NotFoundException('Site negăsit');
    const sb = site.smartbill ?? {};
    const client = await this.defaultClientFor(p, site);
    return {
      paymentId: p.id,
      siteId: p.siteId,
      siteName: site.name,
      amountCents: p.amount,
      price: Math.round((p.amount / 100) * 100) / 100,
      currency: p.currency,
      paymentType: sb.paymentType || DEFAULT_PAYMENT_TYPE,
      productName: sb.productName || DEFAULT_PRODUCT_NAME,
      measuringUnit: sb.measuringUnit || 'buc',
      seriesName: sb.seriesName || '',
      companyVatCode: sb.companyVatCode || '',
      issueDate: this.todayIso(),
      client,
      smartbillReady: !!(sb.enabled && this.resolveCreds(sb)),
    };
  }

  /** Emite o factură pentru o plată. Idempotent: dacă există deja una emisă, o
   *  întoarce fără a re-emite. */
  async emit(paymentId: string, overrides: EmitOverrides = {}): Promise<Invoice> {
    const existing = await this.invoices.findOne({ where: { paymentId } });
    if (existing && existing.status === 'issued') {
      return existing;
    }

    const p = await this.payments.findOne({ where: { id: paymentId } });
    if (!p) throw new NotFoundException('Plata nu există');
    if (p.status !== 'paid') throw new BadRequestException('Plata nu e finalizată');
    if (p.amount <= 0) throw new BadRequestException('Plata are valoare 0 — nu se facturează');
    if (!p.siteId) throw new BadRequestException('Plata nu are site asociat');

    const site = await this.sites.findById(p.siteId);
    if (!site) throw new NotFoundException('Site negăsit');
    const sb = site.smartbill ?? {};
    if (!sb.enabled) throw new BadRequestException('Facturarea SmartBill nu e activă pe acest site');
    const creds = this.resolveCreds(sb);
    if (!creds) throw new BadRequestException('Credențiale SmartBill lipsă sau invalide');
    if (!sb.companyVatCode) throw new BadRequestException('CIF (companyVatCode) lipsă în setări');
    if (!sb.seriesName) throw new BadRequestException('Seria de facturi lipsă în setări');

    const baseClient = await this.defaultClientFor(p, site);
    const client: InvoiceClientSnapshot = { ...baseClient, ...(overrides.client ?? {}) };
    if (!client.name || !client.name.trim()) {
      throw new BadRequestException('Numele clientului e obligatoriu');
    }

    const price =
      typeof overrides.price === 'number' && overrides.price > 0
        ? overrides.price
        : Math.round((p.amount / 100) * 100) / 100;
    const productName = overrides.productName || sb.productName || DEFAULT_PRODUCT_NAME;
    const measuringUnit = sb.measuringUnit || 'buc';
    const paymentType = overrides.paymentType || sb.paymentType || DEFAULT_PAYMENT_TYPE;
    const issueDate = overrides.issueDate || this.todayIso();

    // Localitate + județ pentru SmartBill (București → județ „Bucuresti" + „Sector N").
    // Sectorul se poate extrage și din adresa/localitatea editată manual.
    const locality = resolveLocalityForSmartbill({
      city: client.city,
      county: client.county,
      address: client.address,
    });
    // Salvăm în snapshot forma finală, ca să reflecte exact ce s-a trimis pe factură.
    // La județ: DOAR RO valid (sau București) — altfel gol; niciodată verbatim.
    client.city = locality.city ?? client.city;
    client.county = locality.county ?? undefined;

    const input: SmartbillInvoiceInput = {
      companyVatCode: sb.companyVatCode,
      seriesName: sb.seriesName,
      issueDate,
      dueDate: issueDate,
      currency: p.currency || 'RON',
      language: 'RO',
      precision: 2,
      isDraft: false,
      useStock: false,
      client: {
        name: client.name.trim(),
        vatCode: client.vatCode || undefined,
        regCom: client.regCom || undefined,
        address: client.address || undefined,
        city: locality.city || client.city || undefined,
        county: locality.county || undefined,
        country: client.country || 'Romania',
        // NU trimitem email pe factură (nu folosim email, nu trimitem facturile pe mail).
        isTaxPayer: client.isTaxPayer ?? false,
      },
      products: [
        {
          name: productName,
          measuringUnitName: measuringUnit,
          currency: p.currency || 'RON',
          quantity: 1,
          price,
          isTaxIncluded: true,
          // Neplătitor TVA: cotă 0.
          taxName: 'Normala',
          taxPercentage: 0,
          isService: true,
          saveToDb: false,
        },
      ],
      payment: {
        value: price,
        type: paymentType,
        isCash: false,
        paymentSeries: sb.paymentSeriesName || undefined,
      },
      observations: overrides.observations || undefined,
    };

    let inv = existing ?? this.invoices.create({ paymentId });
    inv.siteId = p.siteId;
    inv.companyVatCode = sb.companyVatCode;
    inv.clientSnapshot = client;
    inv.productSnapshot = { name: productName, measuringUnit, quantity: 1, price };
    inv.amountCents = p.amount;
    inv.currency = p.currency || 'RON';
    inv.paymentType = paymentType;

    try {
      const result = await this.smartbill.createInvoice(creds, input);
      inv.status = 'issued';
      inv.series = result.series ?? sb.seriesName;
      inv.number = result.number ?? null;
      inv.smartbillResponse = result.raw;
      inv.errorText = null;
      inv.issuedAt = new Date();
      inv = await this.invoices.save(inv);

      // Descarcă + salvează PDF-ul local (best-effort — nu eșua factura dacă pică).
      if (inv.series && inv.number) {
        try {
          const pdf = await this.smartbill.getInvoicePdf(
            creds,
            sb.companyVatCode,
            inv.series,
            inv.number,
          );
          const dir = join(this.uploadsDir(), 'invoices');
          await fs.mkdir(dir, { recursive: true });
          const rel = join('invoices', `${inv.id}.pdf`);
          await fs.writeFile(join(this.uploadsDir(), rel), pdf);
          inv.pdfPath = rel;
          inv = await this.invoices.save(inv);
        } catch (pdfErr) {
          this.logger.warn(`PDF download failed for invoice ${inv.id}: ${(pdfErr as Error).message}`);
        }
      }
      return inv;
    } catch (err) {
      inv.status = 'failed';
      inv.errorText = (err as Error).message.slice(0, 1000);
      inv.issuedAt = null;
      inv = await this.invoices.save(inv);
      throw new BadRequestException(inv.errorText);
    }
  }

  /**
   * Marchează o plată ca „facturată" FĂRĂ să emită ceva real pe SmartBill. Creează
   * un rând Invoice cu status='manual' (fără serie/număr/PDF), doar ca să dispară din
   * „De facturat". Reversibil: ștergerea marcajului readuce plata în listă.
   */
  async markManual(paymentId: string): Promise<Invoice> {
    const existing = await this.invoices.findOne({ where: { paymentId } });
    if (existing && existing.status === 'issued') {
      throw new BadRequestException('Plata are deja o factură emisă real');
    }
    const p = await this.payments.findOne({ where: { id: paymentId } });
    if (!p) throw new NotFoundException('Plata nu există');
    if (p.status !== 'paid') throw new BadRequestException('Plata nu e finalizată');
    if (!p.siteId) throw new BadRequestException('Plata nu are site asociat');

    let inv = existing ?? this.invoices.create({ paymentId });
    inv.siteId = p.siteId;
    inv.status = 'manual';
    // Snapshot minim (nume/email din plată), fără apel Stripe/SmartBill.
    inv.clientSnapshot = {
      name: p.customerName ?? undefined,
      email: p.customerEmail ?? undefined,
      isTaxPayer: false,
    };
    inv.productSnapshot = {
      name: 'Marcată ca facturată (fără factură reală)',
      measuringUnit: 'buc',
      quantity: 1,
      price: Math.round((p.amount / 100) * 100) / 100,
    };
    inv.amountCents = p.amount;
    inv.currency = p.currency || 'RON';
    inv.companyVatCode = null;
    inv.series = null;
    inv.number = null;
    inv.paymentType = null;
    inv.pdfPath = null;
    inv.smartbillResponse = null;
    inv.errorText = null;
    inv.issuedAt = new Date();
    inv = await this.invoices.save(inv);
    this.logger.log(`Plata ${paymentId} marcată ca facturată manual (fără emitere reală).`);
    return inv;
  }

  /** Marchează mai multe plăți ca facturate manual (rapid, doar DB, fără SmartBill). */
  async markManualBulk(paymentIds: string[]): Promise<BulkEmitResult[]> {
    const ids = Array.from(new Set((paymentIds ?? []).filter(Boolean)));
    const out: BulkEmitResult[] = [];
    for (const pid of ids) {
      try {
        const inv = await this.markManual(pid);
        out.push({ paymentId: pid, ok: true, invoiceId: inv.id });
      } catch (err) {
        out.push({ paymentId: pid, ok: false, error: (err as Error).message });
      }
    }
    return out;
  }

  /**
   * Emiterea în bloc rulează ASINCRON (poate dura minute pentru zeci de facturi:
   * fiecare = create + PDF + throttle SmartBill), ca să nu cadă pe timeout-ul HTTP.
   * `startBulkEmit` întoarce imediat un jobId; frontend-ul face polling pe
   * `getBulkEmitJob` până la finalizare, cu progres live (câte s-au emis / eșuat).
   */
  startBulkEmit(
    paymentIds: string[],
    overridesByPayment: Record<string, EmitOverrides> = {},
  ): { jobId: string; total: number } {
    this.pruneBulkJobs();
    const ids = Array.from(new Set((paymentIds ?? []).filter(Boolean)));
    const job: BulkEmitJob = {
      id: randomUUID(),
      total: ids.length,
      done: 0,
      ok: 0,
      failed: 0,
      status: 'running',
      results: [],
      startedAt: Date.now(),
      finishedAt: null,
    };
    this.bulkJobs.set(job.id, job);
    // Fire-and-forget — procesarea continuă pe server chiar dacă adminul închide tabul.
    void this.runBulkEmit(job, ids, overridesByPayment);
    return { jobId: job.id, total: job.total };
  }

  /** Loop-ul efectiv de emitere, actualizând progresul jobului după fiecare factură.
   *  Throttle ~1.2 req combinat/sec (rate limit SmartBill = 3/sec, fiecare = create + PDF). */
  private async runBulkEmit(
    job: BulkEmitJob,
    ids: string[],
    overridesByPayment: Record<string, EmitOverrides>,
  ): Promise<void> {
    for (let i = 0; i < ids.length; i++) {
      const pid = ids[i];
      try {
        const inv = await this.emit(pid, overridesByPayment[pid] ?? {});
        job.ok += 1;
        job.results.push({ paymentId: pid, ok: true, invoiceId: inv.id });
      } catch (err) {
        job.failed += 1;
        job.results.push({ paymentId: pid, ok: false, error: (err as Error).message });
      }
      job.done += 1;
      if (i < ids.length - 1) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    job.status = 'done';
    job.finishedAt = Date.now();
    this.logger.log(
      `Bulk emit ${job.id}: ${job.ok} emise, ${job.failed} eșuate din ${job.total}.`,
    );
  }

  /** Starea unui job de emitere în bloc (pentru polling din admin). */
  getBulkEmitJob(jobId: string): BulkEmitJob | null {
    return this.bulkJobs.get(jobId) ?? null;
  }

  /** Curăță joburile terminate mai vechi de 30 min (in-memory, single-instance). */
  private pruneBulkJobs(): void {
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [id, j] of this.bulkJobs) {
      if (j.finishedAt && j.finishedAt < cutoff) this.bulkJobs.delete(id);
    }
  }

  /** Returnează calea absolută + numele fișierului PDF pentru download. */
  async getPdfFile(invoiceId: string): Promise<{ path: string; filename: string }> {
    const inv = await this.invoices.findOne({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundException('Factura nu există');
    if (!inv.pdfPath) throw new NotFoundException('PDF indisponibil pentru această factură');
    const abs = join(this.uploadsDir(), inv.pdfPath);
    try {
      await fs.access(abs);
    } catch {
      throw new NotFoundException('Fișierul PDF nu mai există pe disc');
    }
    const name = inv.series && inv.number ? `Factura-${inv.series}-${inv.number}.pdf` : `factura-${inv.id}.pdf`;
    return { path: abs, filename: name };
  }

  /**
   * Șterge o factură DOAR din aplicație (rândul din DB + PDF-ul local). NU
   * anulează/stornează nimic în SmartBill — e o curățenie locală (ex. facturi
   * de test sau emise greșit la început). După ștergere, plata redevine
   * „facturabilă" (reapare în listBillable) și poate fi re-emisă.
   */
  async deleteOne(invoiceId: string): Promise<{ ok: true; id: string; paymentId: string }> {
    const inv = await this.invoices.findOne({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundException('Factura nu există');
    if (inv.pdfPath) {
      try {
        await fs.unlink(join(this.uploadsDir(), inv.pdfPath));
      } catch (err) {
        // PDF lipsă sau deja șters — nu blocăm ștergerea rândului.
        this.logger.warn(`PDF ${inv.pdfPath} nu a putut fi șters: ${(err as Error).message}`);
      }
    }
    await this.invoices.delete({ id: invoiceId });
    this.logger.log(
      `Factura ${invoiceId} ștearsă din aplicație (fără storno). Plata ${inv.paymentId} redevine facturabilă.`,
    );
    return { ok: true, id: invoiceId, paymentId: inv.paymentId };
  }

  /** Șterge mai multe facturi deodată (doar din aplicație). */
  async deleteMany(
    ids: string[],
  ): Promise<{ deleted: number; errors: { id: string; error: string }[] }> {
    const unique = Array.from(new Set((ids ?? []).filter(Boolean)));
    let deleted = 0;
    const errors: { id: string; error: string }[] = [];
    for (const id of unique) {
      try {
        await this.deleteOne(id);
        deleted += 1;
      } catch (err) {
        errors.push({ id, error: (err as Error).message });
      }
    }
    return { deleted, errors };
  }

  /** Test rapid al credențialelor SmartBill ale unui site. */
  async testConnection(siteId: string): Promise<{ ok: boolean; series: string[]; message?: string }> {
    const site = await this.sites.findById(siteId);
    if (!site) throw new NotFoundException('Site negăsit');
    const sb = site.smartbill ?? {};
    const creds = this.resolveCreds(sb);
    if (!creds) return { ok: false, series: [], message: 'Email sau token lipsă' };
    if (!sb.companyVatCode) return { ok: false, series: [], message: 'CIF lipsă' };
    return this.smartbill.listSeries(creds, sb.companyVatCode);
  }
}
