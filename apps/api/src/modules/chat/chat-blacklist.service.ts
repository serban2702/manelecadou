import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ChatBlacklist, ChatBlacklistType } from './chat-blacklist.entity';

interface SiteRules {
  ips: Set<string>;
  emails: Set<string>;
  expiresAt: number;
}

const CACHE_TTL_MS = 20_000;

@Injectable()
export class ChatBlacklistService {
  /** Cache per-site (cheia 'null' = entries globale fără site). TTL scurt. */
  private cache = new Map<string, SiteRules>();

  constructor(
    @InjectRepository(ChatBlacklist) private readonly repo: Repository<ChatBlacklist>,
  ) {}

  private static normalize(type: ChatBlacklistType, value: string): string {
    const v = value.trim();
    return type === 'email' ? v.toLowerCase() : v;
  }

  private cacheKey(siteId: string | null): string {
    return siteId ?? 'null';
  }

  private invalidate(siteId: string | null): void {
    this.cache.delete(this.cacheKey(siteId));
  }

  private async rulesFor(siteId: string | null): Promise<SiteRules> {
    const key = this.cacheKey(siteId);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached;
    const rows = await this.repo.find({ where: { siteId: siteId ?? IsNull() } });
    const rules: SiteRules = {
      ips: new Set(rows.filter((r) => r.type === 'ip').map((r) => r.value)),
      emails: new Set(rows.filter((r) => r.type === 'email').map((r) => r.value)),
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    this.cache.set(key, rules);
    return rules;
  }

  /** True dacă IP-ul sau email-ul dat e blocat pentru site-ul respectiv. */
  async isBlocked(args: {
    siteId: string | null;
    ip?: string | null;
    email?: string | null;
  }): Promise<boolean> {
    const rules = await this.rulesFor(args.siteId);
    if (args.ip && rules.ips.has(args.ip.trim())) return true;
    if (args.email && rules.emails.has(args.email.trim().toLowerCase())) return true;
    return false;
  }

  list(siteId: string | null): Promise<ChatBlacklist[]> {
    return this.repo.find({ where: { siteId: siteId ?? IsNull() }, order: { createdAt: 'DESC' } });
  }

  async add(args: {
    siteId: string | null;
    type: ChatBlacklistType;
    value: string;
    reason?: string | null;
    createdByEmail?: string | null;
  }): Promise<ChatBlacklist> {
    if (args.type !== 'ip' && args.type !== 'email') {
      throw new BadRequestException('type trebuie să fie "ip" sau "email"');
    }
    const value = ChatBlacklistService.normalize(args.type, args.value);
    if (!value) throw new BadRequestException('Valoare goală');
    if (args.type === 'email' && !value.includes('@')) {
      throw new BadRequestException('Email invalid');
    }
    const existing = await this.repo.findOne({
      where: { siteId: args.siteId ?? IsNull(), type: args.type, value },
    });
    if (existing) {
      this.invalidate(args.siteId);
      return existing;
    }
    const saved = await this.repo.save(
      this.repo.create({
        siteId: args.siteId,
        type: args.type,
        value,
        reason: args.reason?.trim() || null,
        createdByEmail: args.createdByEmail ?? null,
      }),
    );
    this.invalidate(args.siteId);
    return saved;
  }

  async remove(id: string): Promise<{ ok: true }> {
    const entry = await this.repo.findOne({ where: { id } });
    if (entry) {
      await this.repo.delete(id);
      this.invalidate(entry.siteId);
    }
    return { ok: true };
  }
}
