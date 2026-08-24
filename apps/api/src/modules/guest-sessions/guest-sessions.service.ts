import { Inject, Injectable, NotFoundException, Optional, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ModuleRef } from '@nestjs/core';
import { Repository } from 'typeorm';
import { GuestSession } from './guest-session.entity';
import { IdentityService } from '../identity/identity.service';
import { PromoService } from '../promo/promo.service';
import { SitesService } from '../sites/sites.service';
import { nextSongDiscountPercent, resolveSitePackage } from '../experiences/package-resolve';
import { normalizeTier } from '../payments/packages';
import type { PackageSnapshot } from '../experiences/types';

@Injectable()
export class GuestSessionsService {
  constructor(
    @InjectRepository(GuestSession)
    private readonly repo: Repository<GuestSession>,
    private readonly moduleRef: ModuleRef,
    @Optional()
    @Inject(forwardRef(() => IdentityService))
    private readonly identity?: IdentityService,
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
    if (this.identity && updated.siteId) {
      try {
        await this.identity.linkEmail(updated.siteId, id, normalized);
      } catch {
        /* merge e best-effort — email-ul pe guest rămâne salvat */
      }
    }
    return updated;
  }

  get repository(): Repository<GuestSession> {
    return this.repo;
  }

  followState(g: GuestSession): {
    facebook: boolean;
    tiktok: boolean;
    promoCode: string | null;
  } {
    const meta = (g.meta ?? {}) as Record<string, unknown>;
    return {
      facebook: typeof meta.followFacebookAt === 'string' && !!meta.followFacebookAt,
      tiktok: typeof meta.followTiktokAt === 'string' && !!meta.followTiktokAt,
      promoCode: typeof meta.followPromoCode === 'string' ? meta.followPromoCode : null,
    };
  }

  async markSocialFollow(
    id: string,
    network: 'facebook' | 'tiktok',
    siteId: string | null,
  ): Promise<{ facebook: boolean; tiktok: boolean; promoCode: string | null }> {
    const g = await this.getOrThrow(id);
    const meta: Record<string, unknown> = { ...(g.meta ?? {}) };
    const now = new Date().toISOString();
    if (network === 'facebook' && !meta.followFacebookAt) meta.followFacebookAt = now;
    if (network === 'tiktok' && !meta.followTiktokAt) meta.followTiktokAt = now;

    if (meta.followFacebookAt && meta.followTiktokAt && !meta.followPromoCode) {
      try {
        const promoSvc = this.moduleRef.get(PromoService, { strict: false });
        const promo = await promoSvc.issueSocialFollowDiscount({
          siteId: g.siteId ?? siteId,
          guestId: g.id,
          email: g.email,
          // Cât i-am promis clientului la pachetul lui, nu o cifră fixă în cod.
          percent: await this.nextSongDiscountFor(g.id, g.siteId ?? siteId),
        });
        meta.followPromoCode = promo.code;
      } catch {
        /* PromoService indisponibil — flag-urile de follow rămân, codul se emite la următorul click */
      }
    }

    g.meta = meta;
    await this.repo.save(g);
    return this.followState(g);
  }

  /**
   * Procentul de reducere „la manea următoare" pentru acest guest: cel înghețat în
   * `packageSnapshot` pe ultima lui comandă (ce i s-a promis când a plătit), altfel
   * pachetul rezolvat azi, altfel valoarea implicită. Best-effort — orice eroare cade
   * pe default, reducerea nu are voie să blocheze follow-ul.
   */
  private async nextSongDiscountFor(guestId: string, siteId: string | null): Promise<number> {
    try {
      const rows: Array<{
        packageSnapshot: PackageSnapshot | null;
        packageTier: string | null;
        experienceSlug: string | null;
      }> = await this.repo.manager.query(
        `SELECT "packageSnapshot", "packageTier", "experienceSlug"
           FROM generations
          WHERE "ownerGuestId" = $1 AND "paidUnlocked" = true
          ORDER BY "createdAt" DESC
          LIMIT 1`,
        [guestId],
      );
      const gen = rows?.[0];
      if (!gen) return nextSongDiscountPercent(null, null);
      const site = siteId
        ? await this.moduleRef.get(SitesService, { strict: false }).findById(siteId).catch(() => null)
        : null;
      return nextSongDiscountPercent(
        gen.packageSnapshot,
        resolveSitePackage(site, normalizeTier(gen.packageTier), gen.experienceSlug),
      );
    } catch {
      return nextSongDiscountPercent(null, null);
    }
  }
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
