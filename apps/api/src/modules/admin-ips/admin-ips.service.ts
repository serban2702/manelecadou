import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminIp } from './admin-ip.entity';

/** Cât ține cache-ul de IP-uri active înainte de o recitire din DB. */
const CACHE_TTL_MS = 60_000;

/** Cât așteptăm până rescriem `lastSeenAt` pentru aceeași pereche admin+IP. */
const TOUCH_DEBOUNCE_MS = 5 * 60_000;

@Injectable()
export class AdminIpsService implements OnModuleInit {
  private readonly logger = new Logger('AdminIps');

  /**
   * IP-urile active, ținute în memorie: se citesc la FIECARE sesiune nouă de
   * analytics, iar un SELECT per vizitator ar fi o interogare în plus pe cea mai
   * caldă cale din aplicație.
   */
  private cache = new Set<string>();
  private cacheLoadedAt = 0;

  /** Ultima scriere per `<userId>|<ip>`, ca adminul să nu scrie la fiecare click. */
  private lastTouch = new Map<string, number>();

  constructor(
    @InjectRepository(AdminIp)
    private readonly repo: Repository<AdminIp>,
  ) {}

  async onModuleInit() {
    await this.reload().catch((e) => {
      // Un tabel inexistent la primul boot (înainte de synchronize) nu trebuie
      // să oprească API-ul: cache-ul rămâne gol și nu se exclude nimic.
      this.logger.warn(`initial load failed: ${(e as Error).message}`);
    });
  }

  /** Recitește lista din DB și resetează ceasul cache-ului. */
  async reload(): Promise<void> {
    const rows = await this.repo.find({ where: { enabled: true }, select: { ip: true } });
    this.cache = new Set(rows.map((r) => r.ip));
    this.cacheLoadedAt = Date.now();
  }

  private async ensureFresh(): Promise<void> {
    if (Date.now() - this.cacheLoadedAt < CACHE_TTL_MS) return;
    await this.reload().catch(() => {
      // Păstrăm lista veche: mai bine puțin învechită decât deloc.
      this.cacheLoadedAt = Date.now();
    });
  }

  /**
   * E IP-ul ăsta al unui admin? Varianta sincronă, pentru căile fierbinți.
   * Citește doar cache-ul — un IP adăugat acum apare în cel mult un minut.
   */
  isAdminIpCached(ip: string | null | undefined): boolean {
    if (!ip) return false;
    return this.cache.has(ip);
  }

  /** Ca `isAdminIpCached`, dar împrospătează cache-ul dacă e expirat. */
  async isAdminIp(ip: string | null | undefined): Promise<boolean> {
    if (!ip) return false;
    await this.ensureFresh();
    return this.cache.has(ip);
  }

  /**
   * Înregistrează IP-ul unui admin activ. Apelat des (la fiecare request de
   * admin), deci sare peste scriere dacă a văzut aceeași pereche recent.
   */
  async touch(ip: string | null | undefined, userId: string | null): Promise<void> {
    if (!ip) return;
    const key = `${userId ?? '-'}|${ip}`;
    const now = Date.now();
    if (now - (this.lastTouch.get(key) ?? 0) < TOUCH_DEBOUNCE_MS) return;
    this.lastTouch.set(key, now);
    if (this.lastTouch.size > 500) {
      for (const [k, at] of this.lastTouch) {
        if (now - at >= TOUCH_DEBOUNCE_MS) this.lastTouch.delete(k);
      }
    }

    try {
      const existing = await this.repo.findOne({ where: { ip } });
      if (existing) {
        existing.lastSeenAt = new Date();
        existing.lastUserId = userId ?? existing.lastUserId;
        await this.repo.save(existing);
        if (existing.enabled) this.cache.add(ip);
        return;
      }
      const created = this.repo.create({
        ip,
        lastUserId: userId ?? null,
        lastSeenAt: new Date(),
        enabled: true,
      });
      await this.repo.save(created);
      this.cache.add(ip);
      this.logger.log(`IP nou de admin: ${ip}`);
    } catch (e) {
      this.logger.warn(`touch(${ip}) failed: ${(e as Error).message}`);
    }
  }

  async list(): Promise<AdminIp[]> {
    return this.repo.find({ order: { lastSeenAt: 'DESC' } });
  }

  async setEnabled(id: string, enabled: boolean): Promise<AdminIp | null> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) return null;
    row.enabled = enabled;
    const saved = await this.repo.save(row);
    await this.reload();
    return saved;
  }

  async setLabel(id: string, label: string | null): Promise<AdminIp | null> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) return null;
    row.label = label?.trim() ? label.trim().slice(0, 120) : null;
    return this.repo.save(row);
  }

  async remove(id: string): Promise<boolean> {
    const res = await this.repo.delete({ id });
    await this.reload();
    return (res.affected ?? 0) > 0;
  }

  /** IP-urile active, pentru marcarea retroactivă a istoricului. */
  async enabledIps(): Promise<string[]> {
    await this.ensureFresh();
    return [...this.cache];
  }
}
