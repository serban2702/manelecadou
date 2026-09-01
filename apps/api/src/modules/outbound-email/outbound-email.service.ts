import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { OutboundEmail } from './outbound-email.entity';

export interface RecordEmailInput {
  siteId?: string | null;
  kind?: string | null;
  to: string;
  fromAddress?: string | null;
  replyTo?: string | null;
  subject: string;
  html?: string | null;
  text?: string | null;
  userId?: string | null;
  relatedId?: string | null;
}

export interface ListEmailsParams {
  siteId?: string | null;
  status?: 'queued' | 'sent' | 'failed';
  kind?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class OutboundEmailService {
  private readonly logger = new Logger('OutboundEmailService');

  constructor(
    @InjectRepository(OutboundEmail)
    private readonly repo: Repository<OutboundEmail>,
  ) {}

  /** Creează un rând în starea `queued` înainte de a trimite la provider. */
  async record(input: RecordEmailInput): Promise<OutboundEmail> {
    const row = this.repo.create({
      siteId: input.siteId ?? null,
      kind: input.kind ?? null,
      to: input.to.slice(0, 320),
      fromAddress: input.fromAddress?.slice(0, 320) ?? null,
      replyTo: input.replyTo?.slice(0, 320) ?? null,
      subject: (input.subject ?? '').slice(0, 500),
      html: input.html ?? null,
      text: input.text ?? null,
      userId: input.userId ?? null,
      relatedId: input.relatedId ?? null,
      status: 'queued',
    });
    return this.repo.save(row);
  }

  /** Înlocuiește HTML-ul salvat cu varianta REALĂ trimisă (după decorarea
   *  linkurilor de urmărire). Fără asta, la o reclamație am fi citit din audit
   *  alt mail decât cel primit de client. */
  async updateHtml(id: string, html: string): Promise<void> {
    await this.repo.update(id, { html });
  }

  async markSent(
    id: string,
    update: { provider?: string; providerMessageId?: string; providerNotes?: string },
  ): Promise<void> {
    await this.repo.update(id, {
      status: 'sent',
      provider: update.provider ?? null,
      providerMessageId: update.providerMessageId?.slice(0, 255) ?? null,
      providerNotes: update.providerNotes ?? null,
      finalizedAt: new Date(),
    });
  }

  async markFailed(id: string, errorMessage: string, provider?: string): Promise<void> {
    await this.repo.update(id, {
      status: 'failed',
      provider: provider ?? null,
      errorMessage: errorMessage.slice(0, 4000),
      finalizedAt: new Date(),
    });
  }

  async list(params: ListEmailsParams): Promise<{ items: OutboundEmail[]; total: number }> {
    const qb = this.repo.createQueryBuilder('e').orderBy('e.createdAt', 'DESC');
    if (params.siteId !== undefined && params.siteId !== null) {
      qb.andWhere('e.siteId = :siteId', { siteId: params.siteId });
    }
    if (params.status) qb.andWhere('e.status = :status', { status: params.status });
    if (params.kind) qb.andWhere('e.kind = :kind', { kind: params.kind });
    if (params.q) {
      const like = `%${params.q.toLowerCase()}%`;
      qb.andWhere(
        new Brackets((b) =>
          b
            .where('LOWER(e.to) LIKE :q', { q: like })
            .orWhere('LOWER(e.subject) LIKE :q', { q: like })
            .orWhere('LOWER(COALESCE(e.errorMessage, \'\')) LIKE :q', { q: like }),
        ),
      );
    }
    const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
    const offset = Math.max(params.offset ?? 0, 0);
    qb.take(limit).skip(offset);
    // Pentru list, nu trimitem `html` complet (poate fi mare) — selectăm explicit.
    qb.select([
      'e.id',
      'e.siteId',
      'e.kind',
      'e.status',
      'e.to',
      'e.fromAddress',
      'e.subject',
      'e.provider',
      'e.providerMessageId',
      'e.errorMessage',
      'e.userId',
      'e.relatedId',
      'e.openReplaySessionId',
      'e.createdAt',
      'e.finalizedAt',
    ]);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async findOne(id: string): Promise<OutboundEmail | null> {
    return this.repo.findOne({ where: { id } });
  }

  async stats(siteId: string | null): Promise<{ last24h: Record<string, number>; queued: number; failed: number }> {
    const qb = this.repo
      .createQueryBuilder('e')
      .select('e.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .where('e.createdAt > NOW() - INTERVAL \'24 hours\'')
      .groupBy('e.status');
    if (siteId) qb.andWhere('e.siteId = :siteId', { siteId });
    const rows = await qb.getRawMany<{ status: string; cnt: string }>();
    const last24h: Record<string, number> = { queued: 0, sent: 0, failed: 0 };
    rows.forEach((r) => (last24h[r.status] = Number(r.cnt)));

    const queued = await this.repo.count({
      where: { status: 'queued', ...(siteId ? { siteId } : {}) },
    });
    const failed = await this.repo.count({
      where: { status: 'failed', ...(siteId ? { siteId } : {}) },
    });
    return { last24h, queued, failed };
  }
}
