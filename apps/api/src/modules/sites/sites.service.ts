import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Site, SiteSampleEntry } from './site.entity';

const CACHE_TTL_MS = 30_000;

@Injectable()
export class SitesService {
  private readonly logger = new Logger('SitesService');

  // Cache: domain -> Site
  private domainCache = new Map<string, { site: Site; expiresAt: number }>();
  // Cache: id -> Site
  private idCache = new Map<string, { site: Site; expiresAt: number }>();
  private defaultSite: Site | null = null;
  private defaultExpiresAt = 0;

  constructor(
    @InjectRepository(Site) private readonly repo: Repository<Site>,
  ) {}

  private now(): number { return Date.now(); }

  invalidateCache(): void {
    this.domainCache.clear();
    this.idCache.clear();
    this.defaultExpiresAt = 0;
    this.defaultSite = null;
  }

  async findByDomain(domain: string): Promise<Site | null> {
    const key = domain.toLowerCase().replace(/^www\./, '').split(':')[0];
    const cached = this.domainCache.get(key);
    if (cached && cached.expiresAt > this.now()) return cached.site;
    const site = await this.repo.findOne({ where: { domain: key } });
    if (site) {
      this.domainCache.set(key, { site, expiresAt: this.now() + CACHE_TTL_MS });
      this.idCache.set(site.id, { site, expiresAt: this.now() + CACHE_TTL_MS });
    }
    return site;
  }

  async findById(id: string): Promise<Site | null> {
    const cached = this.idCache.get(id);
    if (cached && cached.expiresAt > this.now()) return cached.site;
    const site = await this.repo.findOne({ where: { id } });
    if (site) this.idCache.set(id, { site, expiresAt: this.now() + CACHE_TTL_MS });
    return site;
  }

  async getDefault(): Promise<Site> {
    if (this.defaultSite && this.defaultExpiresAt > this.now()) return this.defaultSite;
    let site = await this.repo.findOne({ where: { isDefault: true } });
    if (!site) site = await this.repo.findOne({ where: {}, order: { createdAt: 'ASC' } });
    if (!site) throw new NotFoundException('Niciun site nu este configurat');
    this.defaultSite = site;
    this.defaultExpiresAt = this.now() + CACHE_TTL_MS;
    return site;
  }

  async resolveFromHost(hostHeader: string | undefined): Promise<Site> {
    if (hostHeader) {
      const site = await this.findByDomain(hostHeader);
      if (site && site.active) return site;
    }
    return this.getDefault();
  }

  async listAll(): Promise<Site[]> {
    return this.repo.find({ order: { createdAt: 'ASC' } });
  }

  async listActiveDomains(): Promise<string[]> {
    const sites = await this.repo.find({ where: { active: true, sslEnabled: true } });
    return sites.map((s) => s.domain);
  }

  async create(input: Partial<Site>): Promise<Site> {
    if (!input.domain || !input.slug || !input.name) {
      throw new Error('domain, slug și name sunt obligatorii');
    }
    input.domain = input.domain.toLowerCase().replace(/^www\./, '');
    const site = await this.repo.save(this.repo.create(input));
    this.invalidateCache();
    return site;
  }

  async update(id: string, patch: Partial<Site>): Promise<Site> {
    if (patch.domain) patch.domain = patch.domain.toLowerCase().replace(/^www\./, '');

    // Mass-propagation pentru aiChatModeDefault: dacă adminul schimbă modul AI
    // default al unui site, propagăm pe TOATE conversațiile site-ului (admin poate
    // apoi face manual override per conv din /chat). Vrem ca un singur click în
    // /sites să schimbe comportamentul tuturor chat-urilor existente, nu doar al
    // celor noi. Înainte de UPDATE site facem comparare cu valoarea curentă.
    let shouldPropagateAiMode = false;
    let newAiMode: 'manual' | 'suggest' | 'auto' | null = null;
    if (patch.aiChatModeDefault !== undefined) {
      const current = await this.repo.findOne({ where: { id }, select: ['id', 'aiChatModeDefault'] });
      if (current && current.aiChatModeDefault !== patch.aiChatModeDefault) {
        shouldPropagateAiMode = true;
        newAiMode = patch.aiChatModeDefault;
      }
    }

    await this.repo.update({ id }, patch);

    if (shouldPropagateAiMode && newAiMode) {
      // Propagăm pe toate conversațiile site-ului cu UPDATE direct (nu save full
      // entity — evită race condition pe wizardState etc.).
      const result = await this.repo.manager.query(
        `UPDATE conversations SET "aiMode" = $1 WHERE "siteId" = $2`,
        [newAiMode, id],
      );
      this.logger.log(
        `aiChatModeDefault changed for site ${id.slice(0, 8)} → '${newAiMode}'. ` +
        `Propagated to ${result?.[1] ?? 'all'} existing conversations.`,
      );
    }

    this.invalidateCache();
    const site = await this.findById(id);
    if (!site) throw new NotFoundException('Site negăsit');
    return site;
  }

  async remove(id: string): Promise<void> {
    await this.repo.delete({ id });
    this.invalidateCache();
  }

  /**
   * Setează o mostră audio (style sau voice) atomic, la nivel de DB, fără a
   * încărca/rescrie restul JSON-ului `suno`. Folosit din `SiteSamplesService`
   * pentru a evita race condition la generări concurente — o singură comandă
   * Postgres `UPDATE` cu `jsonb` merge înseamnă că două commit-uri pe chei
   * diferite NU se mai suprascriu reciproc (înainte: read-modify-write din
   * memorie, last writer wins — pierdeai mostre dacă userul genera mai multe
   * deodată).
   */
  async setSampleEntry(
    siteId: string,
    kind: 'style' | 'voice',
    key: string,
    entry: SiteSampleEntry,
  ): Promise<void> {
    const field = kind === 'style' ? 'styleSamples' : 'voiceSamples';
    await this.repo.manager.query(
      `UPDATE sites
         SET suno = COALESCE(suno, '{}'::jsonb)
                  || jsonb_build_object(
                       $1::text,
                       COALESCE(suno->$1, '{}'::jsonb)
                         || jsonb_build_object($2::text, $3::jsonb)
                     )
       WHERE id = $4`,
      [field, key, JSON.stringify(entry), siteId],
    );
    this.invalidateCache();
  }
}
