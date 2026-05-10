import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { KbEntry } from './entities/kb-entry.entity';
import { AiReplySuggestion } from './entities/ai-reply-suggestion.entity';

export interface KbInput {
  title: string;
  content: string;
  tags?: string[];
  lang?: string;
  active?: boolean;
}

@Injectable()
export class KbService {
  constructor(
    @InjectRepository(KbEntry) public readonly entries: Repository<KbEntry>,
    @InjectRepository(AiReplySuggestion) public readonly suggestions: Repository<AiReplySuggestion>,
  ) {}

  list(siteId: string | null): Promise<KbEntry[]> {
    return this.entries.find({
      where: siteId ? { siteId } : {},
      order: { updatedAt: 'DESC' },
    });
  }

  async get(id: string): Promise<KbEntry> {
    const e = await this.entries.findOne({ where: { id } });
    if (!e) throw new NotFoundException('Articol KB inexistent');
    return e;
  }

  create(input: KbInput & { siteId: string | null }): Promise<KbEntry> {
    const e = this.entries.create({
      title: input.title,
      content: input.content,
      tags: input.tags ?? [],
      lang: input.lang ?? 'ro',
      active: input.active ?? true,
      siteId: input.siteId,
    });
    return this.entries.save(e);
  }

  async update(id: string, patch: Partial<KbInput>): Promise<KbEntry> {
    const e = await this.get(id);
    if (patch.title != null) e.title = patch.title;
    if (patch.content != null) e.content = patch.content;
    if (patch.tags != null) e.tags = patch.tags;
    if (patch.lang != null) e.lang = patch.lang;
    if (patch.active != null) e.active = patch.active;
    return this.entries.save(e);
  }

  async delete(id: string): Promise<void> {
    await this.get(id);
    await this.entries.delete({ id });
  }

  /**
   * Full-text search peste KB folosind Postgres `tsvector`.
   * Folosim config `simple` ca fallback compatibil dacă `romanian` nu e instalat.
   * `plainto_tsquery` curăță automat input-ul.
   */
  async search(query: string, siteId: string | null, limit = 5): Promise<Array<KbEntry & { rank: number }>> {
    const cleaned = query.replace(/[^\p{L}\p{N}\s]+/gu, ' ').trim();
    if (!cleaned) return [];
    // Try romanian first; fall back to simple if config not present.
    const config = await this.tsConfig();
    const qb = this.entries
      .createQueryBuilder('e')
      .addSelect(`ts_rank(to_tsvector('${config}', e.title || ' ' || e.content), plainto_tsquery('${config}', :q))`, 'rank')
      .where('e.active = :active', { active: true })
      .andWhere(`to_tsvector('${config}', e.title || ' ' || e.content) @@ plainto_tsquery('${config}', :q)`, { q: cleaned });
    if (siteId) qb.andWhere('e."siteId" = :siteId', { siteId });
    const rows = await qb.orderBy('rank', 'DESC').limit(limit).getRawAndEntities();
    return rows.entities.map((ent, i) => ({ ...ent, rank: parseFloat(rows.raw[i]?.rank ?? '0') }));
  }

  private cachedConfig: string | null = null;
  private async tsConfig(): Promise<string> {
    if (this.cachedConfig) return this.cachedConfig;
    try {
      const r = await this.entries.query(`SELECT cfgname FROM pg_ts_config WHERE cfgname = 'romanian' LIMIT 1`);
      this.cachedConfig = r.length ? 'romanian' : 'simple';
    } catch {
      this.cachedConfig = 'simple';
    }
    return this.cachedConfig!;
  }
}
