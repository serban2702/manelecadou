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

export type BulkJob = {
  siteId: string;
  status: 'running' | 'done' | 'error';
  total: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: string[];
  startedAt: number;
  endedAt?: number;
  errorMessage?: string;
};

@Injectable()
export class SeoPagesService {
  private readonly logger = new Logger('SeoPagesService');
  /** Jobs in-progress per siteId. Memorie efemeră — la restart se pierde,
   *  dar paginile generate până atunci rămân persistente în DB. */
  private readonly bulkJobs = new Map<string, BulkJob>();

  constructor(
    @InjectRepository(SeoPage) private readonly repo: Repository<SeoPage>,
    private readonly generator: SeoPageGeneratorService,
  ) {}

  bulkJob(siteId: string): BulkJob | null {
    return this.bulkJobs.get(siteId) ?? null;
  }

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
   * Kick-off async pentru job-ul bulk. Returnează imediat — admin face polling
   * pe `bulkJob(siteId)` ca să afișeze progres. Generarea efectivă durează
   * 5-10 minute pentru 50 de pagini și depășește orice timeout HTTP rezonabil.
   */
  startBulk(site: Site, opts: { regenerate?: boolean } = {}): BulkJob {
    const existing = this.bulkJobs.get(site.id);
    if (existing && existing.status === 'running') {
      return existing; // deja rulează — nu-l dublăm
    }
    const job: BulkJob = {
      siteId: site.id,
      status: 'running',
      total: SEO_SLUG_TEMPLATES.length,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: [],
      startedAt: Date.now(),
    };
    this.bulkJobs.set(site.id, job);
    // fire-and-forget — eroarea e capturată în catch-ul de mai jos
    void this.runBulk(site, opts, job);
    return job;
  }

  private async runBulk(
    site: Site,
    opts: { regenerate?: boolean },
    job: BulkJob,
  ): Promise<void> {
    try {
      const existing = await this.repo.find({ where: { siteId: site.id } });
      const bySlug = new Map(existing.map((p) => [p.slug, p]));

      for (const template of SEO_SLUG_TEMPLATES) {
        const current = bySlug.get(template.slug);
        if (current?.source === 'manual') {
          job.skipped++;
          job.processed++;
          continue;
        }
        if (current && !opts.regenerate) {
          job.skipped++;
          job.processed++;
          continue;
        }
        try {
          const result = await this.regenerateOne(site, template.slug);
          if (!result) {
            job.failed.push(template.slug);
          } else if (current) {
            job.updated++;
          } else {
            job.created++;
          }
        } catch (err) {
          this.logger.error(
            `bulk slug=${template.slug} failed: ${(err as Error).message}`,
          );
          job.failed.push(template.slug);
        }
        job.processed++;
      }
      job.status = 'done';
    } catch (err) {
      job.status = 'error';
      job.errorMessage = (err as Error).message;
      this.logger.error(`bulk job failed: ${(err as Error).message}`);
    } finally {
      job.endedAt = Date.now();
    }
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
