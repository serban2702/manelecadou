import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GuestSession } from './guest-session.entity';

@Injectable()
export class GuestSessionsService {
  constructor(
    @InjectRepository(GuestSession)
    private readonly repo: Repository<GuestSession>,
  ) {}

  async create(siteId: string | null, meta?: Record<string, unknown>): Promise<GuestSession> {
    const created = this.repo.create({ meta: meta ?? null, siteId });
    return this.repo.save(created);
  }

  async findById(id: string): Promise<GuestSession | null> {
    if (!isUuid(id)) return null;
    return this.repo.findOne({ where: { id } });
  }

  /** Asigură o sesiune guest. Dacă id-ul e dat și aparține site-ului curent, o reutilizează;
   *  altfel creează o sesiune nouă pe site-ul curent (anti-cross-site sharing). */
  async ensure(id: string | undefined, siteId: string | null): Promise<GuestSession> {
    if (id) {
      const found = await this.findById(id);
      if (found && (!siteId || !found.siteId || found.siteId === siteId)) {
        return found;
      }
    }
    return this.create(siteId);
  }

  async getOrThrow(id: string): Promise<GuestSession> {
    const g = await this.findById(id);
    if (!g) throw new NotFoundException('Guest session not found');
    return g;
  }

  async touch(id: string): Promise<void> {
    if (!isUuid(id)) return;
    await this.repo.update({ id }, { lastSeenAt: new Date() });
  }

  async markDemoUsed(id: string): Promise<void> {
    await this.repo.update({ id }, { freeDemoUsed: true });
  }

  async setEmail(id: string, email: string): Promise<GuestSession> {
    const normalized = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new Error('Invalid email');
    }
    await this.repo.update({ id }, { email: normalized });
    const updated = await this.findById(id);
    if (!updated) throw new NotFoundException('Guest session not found');
    return updated;
  }

  get repository(): Repository<GuestSession> {
    return this.repo;
  }
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
