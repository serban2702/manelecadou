import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { IsNull, Repository } from 'typeorm';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { Invoice, InvoiceClientSnapshot } from './invoice.entity';
import { Payment } from '../payments/payment.entity';
import { User } from '../users/user.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { Site, SiteSmartbill } from '../sites/site.entity';
import { SitesService } from '../sites/sites.service';
import { PaymentsService } from '../payments/payments.service';
import { decryptSecret } from '../../common/crypto.util';
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

export interface BillableRow {
  paymentId: string;
  siteId: string | null;
  amountCents: number;
  currency: string;
  createdAt: Date;
  buyerName: string | null;
  buyerEmail: string | null;
  smartbillReady: boolean;
}

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(GuestSession) private readonly guests: Repository<GuestSession>,
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

  /** Plățile facturabile: paid, sumă > 0, fără factură emisă cu succes. */
  async listBillable(siteId: string | null): Promise<BillableRow[]> {
    const qb = this.payments
      .createQueryBuilder('p')
      .leftJoin(
        Invoice,
        'inv',
        "inv.paymentId = p.id AND inv.status = 'issued'",
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
    return out;
  }

  private async enrichPayment(p: Payment): Promise<BillableRow> {
    const site = p.siteId ? await this.sites.findById(p.siteId) : null;
    const creds = this.resolveCreds(site?.smartbill);
    // Numele real al plătitorului vine din billing-ul Stripe; emailul din DB.
    const [stripe, email] = await Promise.all([
      this.stripeDetails(p.id),
      this.buyerEmail(p),
    ]);
    let buyerName = stripe?.name ?? null;
    if (!buyerName && p.userId) {
      const u = await this.users.findOne({ where: { id: p.userId } });
      buyerName = u?.name ?? null;
    }
    return {
      paymentId: p.id,
      siteId: p.siteId,
      amountCents: p.amount,
      currency: p.currency,
      createdAt: p.createdAt,
      buyerName,
      buyerEmail: stripe?.email ?? email,
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

  /** Construiește datele clientului implicite pentru o plată (preview). */
  private async defaultClientFor(
    p: Payment,
    site: Site,
  ): Promise<InvoiceClientSnapshot> {
    const sb = site.smartbill ?? {};
    if (sb.useDefaultClient && sb.defaultClient?.name) {
      return { country: 'Romania', isTaxPayer: false, ...sb.defaultClient };
    }
    // Cumpărătorul real: nume + adresă din billing-ul Stripe, email din DB.
    const [stripe, email] = await Promise.all([
      this.stripeDetails(p.id),
      this.buyerEmail(p),
    ]);
    let name = stripe?.name ?? '';
    if (!name && p.userId) {
      const u = await this.users.findOne({ where: { id: p.userId } });
      name = u?.name ?? '';
    }
    // Fallback pe clientul implicit dacă nu avem nume de la cumpărător.
    if (!name && sb.defaultClient?.name) {
      return { country: 'Romania', isTaxPayer: false, ...sb.defaultClient };
    }
    const addr = stripe?.address ?? null;
    const street = [addr?.line1, addr?.line2].filter(Boolean).join(', ');
    return {
      name,
      email: email ?? undefined,
      address: street || undefined,
      city: addr?.city ?? undefined,
      county: addr?.state ?? undefined,
      country: this.mapCountry(addr?.country),
      isTaxPayer: false,
    };
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
      paymentType: sb.paymentType || 'Card',
      productName: sb.productName || 'Melodie personalizată',
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
    const productName = overrides.productName || sb.productName || 'Melodie personalizată';
    const measuringUnit = sb.measuringUnit || 'buc';
    const paymentType = overrides.paymentType || sb.paymentType || 'Card';
    const issueDate = overrides.issueDate || this.todayIso();

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
        city: client.city || undefined,
        county: client.county || undefined,
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

  /** Emite mai multe facturi, throttle-uit la ~1.2 req combinat/sec (rate limit
   *  SmartBill = 3 req/sec, fiecare factură = create + PDF). */
  async emitBulk(
    paymentIds: string[],
    overridesByPayment: Record<string, EmitOverrides> = {},
  ): Promise<Array<{ paymentId: string; ok: boolean; error?: string; invoiceId?: string }>> {
    const out: Array<{ paymentId: string; ok: boolean; error?: string; invoiceId?: string }> = [];
    for (let i = 0; i < paymentIds.length; i++) {
      const pid = paymentIds[i];
      try {
        const inv = await this.emit(pid, overridesByPayment[pid] ?? {});
        out.push({ paymentId: pid, ok: true, invoiceId: inv.id });
      } catch (err) {
        out.push({ paymentId: pid, ok: false, error: (err as Error).message });
      }
      // throttle între facturi (sare după ultima)
      if (i < paymentIds.length - 1) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    return out;
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
