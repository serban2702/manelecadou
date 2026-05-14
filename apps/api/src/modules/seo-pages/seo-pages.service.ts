import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeoPage } from './seo-page.entity';
import {
  SEO_SLUG_TEMPLATES,
  findSlugTemplate,
  type SeoSlugTemplate,
  type SeoCategory,
} from './seo-page-templates';
import { SeoPageGeneratorService } from './seo-page-generator.service';
import type { Site } from '../sites/site.entity';

@Injectable()
export class SeoPagesService {
  private readonly logger = new Logger('SeoPagesService');

  constructor(
    @InjectRepository(SeoPage) private readonly repo: Repository<SeoPage>,
    private readonly generator: SeoPageGeneratorService,
  ) {}

  /** Listă publică (doar published) pentru un site dat. */
  async listPublished(siteId: string): Promise<SeoPage[]> {
    return this.repo.find({
      where: { siteId, published: true },
      order: { category: 'ASC', slug: 'ASC' },
    });
  }

  async listAll(siteId: string): Promise<SeoPage[]> {
    return this.repo.find({
      where: { siteId },
      order: { category: 'ASC', slug: 'ASC' },
    });
  }

  async findBySlug(siteId: string, slug: string): Promise<SeoPage | null> {
    return this.repo.findOne({ where: { siteId, slug, published: true } });
  }

  async findById(id: string): Promise<SeoPage | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Generează o singură pagină (sau o regenerează dacă există deja).
   * Idempotent — folosește OpenAI și salvează în DB.
   */
  async regenerateOne(site: Site, slug: string): Promise<SeoPage | null> {
    const template = findSlugTemplate(slug);
    if (!template) {
      this.logger.warn(`unknown SEO slug template: ${slug}`);
      return null;
    }
    const generated = await this.generator.generate(site, template);
    if (!generated) return null;

    const existing = await this.repo.findOne({ where: { siteId: site.id, slug } });
    const row =
      existing ??
      this.repo.create({
        siteId: site.id,
        slug,
        locale: site.locale,
        category: template.category,
        published: true,
        source: 'ai',
      });
    row.title = generated.title;
    row.metaDescription = generated.metaDescription;
    row.h1 = generated.h1;
    row.excerpt = generated.excerpt;
    row.contentMd = generated.contentMd;
    row.locale = site.locale;
    row.category = template.category;
    if (row.source === 'manual') {
      // nu suprascriem manual edits
      this.logger.log(`skip manual page slug=${slug}`);
      return row;
    }
    row.source = 'ai';
    return this.repo.save(row);
  }

  /**
   * Generează TOATE paginile lipsă pentru site-ul curent. Skip pe cele
   * `manual` sau pe cele care deja există dacă `regenerate=false`.
   */
  async regenerateAll(
    site: Site,
    opts: { regenerate?: boolean } = {},
  ): Promise<{ created: number; updated: number; skipped: number; failed: string[] }> {
    const stats = { created: 0, updated: 0, skipped: 0, failed: [] as string[] };
    const existing = await this.repo.find({ where: { siteId: site.id } });
    const bySlug = new Map(existing.map((p) => [p.slug, p]));

    for (const template of SEO_SLUG_TEMPLATES) {
      const current = bySlug.get(template.slug);
      if (current?.source === 'manual') {
        stats.skipped++;
        continue;
      }
      if (current && !opts.regenerate) {
        stats.skipped++;
        continue;
      }
      const result = await this.regenerateOne(site, template.slug);
      if (!result) {
        stats.failed.push(template.slug);
      } else if (current) {
        stats.updated++;
      } else {
        stats.created++;
      }
    }
    return stats;
  }

  async updateManual(
    id: string,
    patch: Partial<Pick<SeoPage, 'title' | 'metaDescription' | 'h1' | 'excerpt' | 'contentMd' | 'published'>>,
  ): Promise<SeoPage | null> {
    const page = await this.repo.findOne({ where: { id } });
    if (!page) return null;
    Object.assign(page, patch);
    page.source = 'manual';
    return this.repo.save(page);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete({ id });
  }

  /** Returnează slug-urile + categoriile pentru hub și pentru sitemap. */
  templates(): SeoSlugTemplate[] {
    return SEO_SLUG_TEMPLATES;
  }

  categories(): SeoCategory[] {
    return Array.from(new Set(SEO_SLUG_TEMPLATES.map((t) => t.category))) as SeoCategory[];
  }
}
