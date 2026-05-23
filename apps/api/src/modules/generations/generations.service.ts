import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { Generation } from './generation.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { User } from '../users/user.entity';
import { Payment } from '../payments/payment.entity';
import { CreateGenerationDto } from './dto/create-generation.dto';
import { MailerService } from '../../mailer/mailer.module';
import { paymentSuccessTemplate } from '../../mailer/templates/templates';
import { brandingFromSite } from '../../mailer/branding';
import { SitesService } from '../sites/sites.service';

export const GENERATIONS_QUEUE = 'generations';

@Injectable()
export class GenerationsService {
  private readonly logger = new Logger('GenerationsService');

  constructor(
    @InjectRepository(Generation) private readonly repo: Repository<Generation>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(GuestSession) private readonly guests: Repository<GuestSession>,
    @InjectQueue(GENERATIONS_QUEUE) private readonly queue: Queue,
    private readonly dataSource: DataSource,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly sites: SitesService,
  ) {}

  async create(
    dto: CreateGenerationDto,
    ctx: { userId: string | null; guestId: string | null; siteId?: string | null },
  ): Promise<Generation> {
    if (!ctx.userId && !ctx.guestId) {
      throw new ForbiddenException('Missing guest session');
    }

    const saved = await this.dataSource.transaction(async (mgr) => {
      const generationRepo = mgr.getRepository(Generation);

      if (dto.type === 'demo') {
        // Marcăm flag-ul pentru telemetrie/raportare, dar NU mai blocăm a doua generare.
        if (ctx.userId) {
          const user = await mgr.getRepository(User).findOne({ where: { id: ctx.userId } });
          if (!user) throw new NotFoundException('User not found');
          if (!user.freeDemoUsed) {
            user.freeDemoUsed = true;
            await mgr.getRepository(User).save(user);
          }
        } else if (ctx.guestId) {
          const guest = await mgr
            .getRepository(GuestSession)
            .findOne({ where: { id: ctx.guestId } });
          if (!guest) throw new NotFoundException('Guest session not found');
          if (!guest.email) throw new ForbiddenException('email_required');
          if (!guest.freeDemoUsed) {
            guest.freeDemoUsed = true;
            await mgr.getRepository(GuestSession).save(guest);
          }
        }
      } else {
        if (!dto.paymentId) throw new ForbiddenException('paymentId required for full generation');
        const payment = await mgr.getRepository(Payment).findOne({ where: { id: dto.paymentId } });
        if (!payment || payment.status !== 'paid') {
          throw new ForbiddenException('payment not confirmed');
        }
      }

      const created = generationRepo.create({
        ownerUserId: ctx.userId,
        ownerGuestId: ctx.userId ? null : ctx.guestId,
        type: dto.type,
        status: 'queued',
        durationSec: dto.type === 'demo' ? 30 : 90,
        style: dto.style,
        occasion: dto.occasion,
        recipientName: dto.recipientName,
        message: dto.message,
        dedication: dto.dedication ?? null,
        voiceArtist: dto.voiceArtist,
        customLyrics: dto.customLyrics ?? null,
        tipAmount: dto.tipAmount ?? 0,
        premium: dto.premium ?? false,
        paymentId: dto.paymentId ?? null,
        locale: dto.locale ?? 'ro',
        siteId: ctx.siteId ?? null,
      });
      return generationRepo.save(created);
    });

    // IMPORTANT: queue.add se face DUPĂ commit-ul tranzacției — altfel worker-ul
    // BullMQ poate prelua job-ul înainte ca generation să fie persistat și
    // primește „generation not found".
    await this.queue.add(
      'generate',
      { generationId: saved.id },
      {
        removeOnComplete: 100,
        removeOnFail: 100,
        // Suno poate dura 2-4 min; lăsăm 8 min ca să nu eșueze prematur
        attempts: 1,
      },
    );

    return saved;
  }

  async findOne(
    id: string,
    ctx: { userId: string | null; guestId: string | null },
  ): Promise<Generation> {
    const g = await this.repo.findOne({ where: { id } });
    if (!g) throw new NotFoundException('Generation not found');
    if (g.ownerUserId && g.ownerUserId === ctx.userId) return g;
    if (g.ownerGuestId && g.ownerGuestId === ctx.guestId) return g;
    throw new ForbiddenException('Not your generation');
  }

  async findOnePublic(id: string): Promise<Generation | null> {
    return this.repo.findOne({ where: { id } });
  }

  async countMine(ctx: { userId: string | null; guestId: string | null }): Promise<number> {
    if (ctx.userId) return this.repo.count({ where: { ownerUserId: ctx.userId } });
    if (ctx.guestId) return this.repo.count({ where: { ownerGuestId: ctx.guestId } });
    return 0;
  }

  /** Count global. siteId === null = cross-site (admin „Toate"). */
  async countAll(siteId: string | null = null): Promise<number> {
    return this.repo.count({ where: siteId ? { siteId } : {} });
  }

  async listMine(ctx: { userId: string | null; guestId: string | null }) {
    if (ctx.userId) {
      return this.repo.find({
        where: { ownerUserId: ctx.userId },
        order: { createdAt: 'DESC' },
        take: 50,
      });
    }
    if (ctx.guestId) {
      return this.repo.find({
        where: { ownerGuestId: ctx.guestId },
        order: { createdAt: 'DESC' },
        take: 50,
      });
    }
    return [];
  }

  async listRecent(limit = 12, siteId: string | null = null) {
    // Doar piesele complete sau cele al căror demo a fost deblocat prin plată/cadou
    // apar în listele publice. Demourile neplătite rămân private pentru proprietar.
    const qb = this.repo
      .createQueryBuilder('g')
      .where('g.status = :status', { status: 'succeeded' })
      .andWhere('(g.type = :full OR g.paidUnlocked = true)', { full: 'full' });
    if (siteId) qb.andWhere('g."siteId" = :siteId', { siteId });
    return qb.orderBy('g.createdAt', 'DESC').take(Math.min(limit, 50)).getMany();
  }

  async listPublic(opts: {
    style?: string;
    occasion?: string;
    voice?: string;
    period?: 'week' | 'month' | 'all';
    sort?: 'recent' | 'popular';
    limit?: number;
    offset?: number;
    siteId?: string | null;
  }): Promise<{ items: Generation[]; total: number }> {
    const qb = this.repo
      .createQueryBuilder('g')
      .where('g.status = :status', { status: 'succeeded' })
      // Galeria publică NU expune demouri neplătite — doar piesele complete sau
      // cele cu paidUnlocked=true (deblocate prin plată sau cod cadou).
      .andWhere('(g.type = :full OR g.paidUnlocked = true)', { full: 'full' });

    if (opts.siteId) qb.andWhere('g."siteId" = :siteId', { siteId: opts.siteId });
    if (opts.style) qb.andWhere('g.style = :style', { style: opts.style });
    if (opts.occasion) qb.andWhere('g.occasion = :occasion', { occasion: opts.occasion });
    if (opts.voice) qb.andWhere('g.voiceArtist = :voice', { voice: opts.voice });

    if (opts.period === 'week') {
      qb.andWhere('g.createdAt >= NOW() - INTERVAL \'7 days\'');
    } else if (opts.period === 'month') {
      qb.andWhere('g.createdAt >= NOW() - INTERVAL \'30 days\'');
    }

    if (opts.sort === 'popular') {
      qb.orderBy('g.viewCount', 'DESC').addOrderBy('g.createdAt', 'DESC');
    } else {
      qb.orderBy('g.createdAt', 'DESC');
    }

    const limit = Math.min(Math.max(opts.limit ?? 24, 1), 300);
    const offset = Math.max(opts.offset ?? 0, 0);
    qb.take(limit).skip(offset);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async incrementViewCount(id: string): Promise<void> {
    await this.repo.increment({ id }, 'viewCount', 1);
  }

  /**
   * Top tracks pentru pagina /top — agregare după viewCount în fereastra cerută.
   * Doar generări `succeeded` care sunt vizibile public (full sau demo deblocat).
   */
  async listTop(opts: {
    siteId: string | null;
    period?: 'week' | 'month' | 'all';
    limit?: number;
  }): Promise<Generation[]> {
    const qb = this.repo
      .createQueryBuilder('g')
      .where('g.status = :status', { status: 'succeeded' })
      .andWhere('(g.type = :full OR g.paidUnlocked = true)', { full: 'full' });
    if (opts.siteId) qb.andWhere('g."siteId" = :siteId', { siteId: opts.siteId });
    if (opts.period === 'week') {
      qb.andWhere('g."createdAt" >= NOW() - INTERVAL \'7 days\'');
    } else if (opts.period === 'month') {
      qb.andWhere('g."createdAt" >= NOW() - INTERVAL \'30 days\'');
    }
    const limit = Math.min(Math.max(opts.limit ?? 5, 1), 50);
    return qb
      .orderBy('g.viewCount', 'DESC')
      .addOrderBy('g."createdAt"', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * Re-rulează pipeline-ul de generare pentru o generare existentă (eșuată sau
   * blocată). Resetează status, eroare și URL-urile audio, apoi re-enqueue
   * job-ul. Permis doar pentru owner. Limită implicită: max 3 reîncercări.
   */
  async retry(
    generationId: string,
    ctx: { userId: string | null; guestId: string | null },
  ): Promise<Generation> {
    const gen = await this.repo.findOne({ where: { id: generationId } });
    if (!gen) throw new NotFoundException('Generation not found');
    const ownerOk =
      (gen.ownerUserId && gen.ownerUserId === ctx.userId) ||
      (gen.ownerGuestId && gen.ownerGuestId === ctx.guestId);
    if (!ownerOk) throw new ForbiddenException('Not your generation');

    if (gen.status === 'queued' || gen.status === 'writing_lyrics' ||
        gen.status === 'checking_lyrics' || gen.status === 'generating_audio') {
      throw new ConflictException('already_running');
    }
    if (gen.status === 'succeeded') {
      throw new ConflictException('already_succeeded');
    }

    const max = 3;
    if ((gen.retryCount ?? 0) >= max) {
      throw new ForbiddenException('retry_limit_reached');
    }

    gen.status = 'queued';
    gen.error = null;
    gen.audioUrl = null;
    gen.bonusAudioUrl = null;
    gen.coverUrl = null;
    gen.tracks = [];
    gen.providerJobId = null;
    gen.completedAt = null;
    gen.retryCount = (gen.retryCount ?? 0) + 1;
    const saved = await this.repo.save(gen);

    await this.queue.add(
      'generate',
      { generationId: saved.id },
      { removeOnComplete: 100, removeOnFail: 100, attempts: 1 },
    );

    return saved;
  }

  async unlockWithGift(
    generationId: string,
    consumeFn: () => Promise<{ ok: boolean; reason?: string }>,
    ctx: { userId: string | null; guestId: string | null },
  ): Promise<Generation> {
    return this.dataSource.transaction(async (mgr) => {
      const gen = await mgr.getRepository(Generation).findOne({ where: { id: generationId } });
      if (!gen) throw new NotFoundException('Generation not found');
      const ownerOk =
        (gen.ownerUserId && gen.ownerUserId === ctx.userId) ||
        (gen.ownerGuestId && gen.ownerGuestId === ctx.guestId);
      if (!ownerOk) throw new ForbiddenException('Not your generation');
      if (gen.paidUnlocked) return gen;

      const consume = await consumeFn();
      if (!consume.ok) {
        throw new ForbiddenException(consume.reason ?? 'gift_invalid');
      }
      gen.paidUnlocked = true;
      return mgr.getRepository(Generation).save(gen);
    });
  }

  /**
   * Creează o generation type='full' în starea „pending payment" — fără să o
   * pună la coadă. Folosit de flow-ul „pay-first" (site.demoEnabled=false):
   * userul completează formularul, vede prețul, plătește, ABIA APOI se
   * generează maneaua. Diferența față de create(type='full'):
   *   - Nu necesită paymentId în input (paymentul se creează după).
   *   - Nu se enqueueează (status rămâne 'pending').
   *   - paidUnlocked=false (devine true după webhook).
   */
  async createPendingForPayment(
    dto: Omit<CreateGenerationDto, 'type' | 'paymentId'>,
    ctx: { userId: string | null; guestId: string | null; siteId?: string | null },
  ): Promise<Generation> {
    if (!ctx.userId && !ctx.guestId) {
      throw new ForbiddenException('Missing guest session');
    }
    if (!ctx.userId && ctx.guestId) {
      const guest = await this.dataSource
        .getRepository(GuestSession)
        .findOne({ where: { id: ctx.guestId } });
      if (!guest) throw new NotFoundException('Guest session not found');
      if (!guest.email) throw new ForbiddenException('email_required');
    }
    const gen = this.repo.create({
      ownerUserId: ctx.userId,
      ownerGuestId: ctx.userId ? null : ctx.guestId,
      type: 'full',
      status: 'pending',
      durationSec: 90,
      style: dto.style,
      occasion: dto.occasion,
      recipientName: dto.recipientName,
      message: dto.message,
      dedication: dto.dedication ?? null,
      voiceArtist: dto.voiceArtist,
      customLyrics: dto.customLyrics ?? null,
      tipAmount: dto.tipAmount ?? 0,
      premium: dto.premium ?? false,
      paymentId: null,
      paidUnlocked: false,
      locale: dto.locale ?? 'ro',
      siteId: ctx.siteId ?? null,
    });
    return this.repo.save(gen);
  }

  /**
   * Marchează o generation ca plătită. Apelat din webhook-ul Stripe după ce
   * un payment a fost confirmat. Idempotent:
   *   - paidUnlocked devine true (acoperă atât flow-ul pay-first cât și
   *     demo-first — în demo-first, generation era deja 'succeeded' dar
   *     paidUnlocked=false; webhook-ul e singura sursă de adevăr).
   *   - dacă status='pending' (flow pay-first), o pune la coadă.
   *   - trimite emailul de confirmare a plății (cu link spre /m/<id>).
   */
  async markPaidAndQueue(generationId: string, paymentId: string): Promise<Generation | null> {
    const gen = await this.repo.findOne({ where: { id: generationId } });
    if (!gen) return null;

    const wasPending = gen.status === 'pending';
    const wasAlreadyUnlocked = gen.paidUnlocked;

    gen.paidUnlocked = true;
    gen.paymentId = paymentId;
    if (wasPending) gen.status = 'queued';
    const saved = await this.repo.save(gen);

    if (wasPending) {
      await this.queue.add(
        'generate',
        { generationId: saved.id },
        { removeOnComplete: 100, removeOnFail: 100, attempts: 1 },
      );
    }

    if (!wasAlreadyUnlocked) {
      await this.sendPaymentConfirmationEmail(saved, paymentId);
    }

    return saved;
  }

  private async sendPaymentConfirmationEmail(gen: Generation, paymentId: string): Promise<void> {
    try {
      const payment = await this.dataSource
        .getRepository(Payment)
        .findOne({ where: { id: paymentId } });
      if (!payment) return;

      let email: string | null = null;
      if (gen.ownerUserId) {
        const u = await this.users.findOne({ where: { id: gen.ownerUserId } });
        email = u?.email ?? null;
      } else if (gen.ownerGuestId) {
        const g = await this.guests.findOne({ where: { id: gen.ownerGuestId } });
        email = g?.email ?? null;
      }
      if (!email) return;

      const site = gen.siteId ? await this.sites.findById(gen.siteId) : null;
      const siteUrl = site
        ? site.domain.startsWith('localhost') || site.domain.startsWith('127.')
          ? this.config.get<string>('APP_URL') ?? `http://${site.domain}`
          : `https://${site.domain}`
        : this.config.get<string>('APP_URL') ?? 'http://localhost:1500';
      const link = `${siteUrl}/m/${gen.id}`;

      const tpl = paymentSuccessTemplate({
        amountRON: payment.amount / 100,
        currency: payment.currency,
        generationLink: link,
        recipientName: gen.recipientName,
        locale: site?.locale ?? gen.locale ?? 'ro',
        branding: brandingFromSite(site),
      });
      await this.mailer.send(
        {
          to: email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          from: site?.fromEmail ?? undefined,
        },
        { site },
      );
    } catch (err) {
      this.logger.warn(
        `payment confirmation email failed for gen ${gen.id}: ${(err as Error).message}`,
      );
    }
  }

  async unlockWithPayment(
    generationId: string,
    paymentId: string,
    ctx: { userId: string | null; guestId: string | null },
  ): Promise<Generation> {
    return this.dataSource.transaction(async (mgr) => {
      const gen = await mgr.getRepository(Generation).findOne({ where: { id: generationId } });
      if (!gen) throw new NotFoundException('Generation not found');
      const ownerOk =
        (gen.ownerUserId && gen.ownerUserId === ctx.userId) ||
        (gen.ownerGuestId && gen.ownerGuestId === ctx.guestId);
      if (!ownerOk) throw new ForbiddenException('Not your generation');

      const payment = await mgr.getRepository(Payment).findOne({ where: { id: paymentId } });
      if (!payment || payment.status !== 'paid') {
        throw new ForbiddenException('payment not confirmed');
      }

      gen.paidUnlocked = true;
      gen.paymentId = payment.id;
      return mgr.getRepository(Generation).save(gen);
    });
  }
}
