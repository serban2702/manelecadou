import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminGuard } from '../../common/admin.guard';
import { SeoPagesService } from './seo-pages.service';
import { mdToHtml } from './md-to-html';

/** Public — citit de Next.js pentru a randa /articole/<slug>. */
@Controller('public/seo-pages')
export class PublicSeoPagesController {
  constructor(private readonly svc: SeoPagesService) {}

  @Get()
  async list(@Req() req: Request) {
    if (!req.site) throw new NotFoundException('Site neconfigurat');
    const pages = await this.svc.listPublished(req.site.id);
    // listă scurtă pentru hub-uri — fără contentMd (prea mare)
    return {
      categories: this.svc.categories(),
      items: pages.map((p) => ({
        slug: p.slug,
        localizedSlug: p.localizedSlug ?? p.slug,
        category: p.category,
        title: p.title,
        h1: p.h1,
        excerpt: p.excerpt,
        updatedAt: p.updatedAt,
      })),
    };
  }

  @Get(':slug')
  async one(@Req() req: Request, @Param('slug') slug: string) {
    if (!req.site) throw new NotFoundException('Site neconfigurat');
    const page = await this.svc.findBySlug(req.site.id, slug);
    if (!page) throw new NotFoundException('Pagina nu există');
    return {
      slug: page.slug,
      localizedSlug: page.localizedSlug ?? page.slug,
      category: page.category,
      locale: page.locale,
      title: page.title,
      metaDescription: page.metaDescription,
      h1: page.h1,
      excerpt: page.excerpt,
      contentMd: page.contentMd,
      contentHtml: mdToHtml(page.contentMd),
      updatedAt: page.updatedAt,
    };
  }
}

/** Admin — generare, listare, edit, ștergere. */
@UseGuards(AdminGuard)
@Controller('admin/seo-pages')
export class AdminSeoPagesController {
  constructor(private readonly svc: SeoPagesService) {}

  @Get('templates')
  templates() {
    return this.svc.templates();
  }

  @Get()
  async list(@Req() req: Request) {
    if (!req.site) throw new NotFoundException('Site neconfigurat');
    return this.svc.listAll(req.site.id);
  }

  @Post('regenerate-all')
  @HttpCode(202)
  async regenerateAll(
    @Req() req: Request,
    @Body() body: { regenerate?: boolean } = {},
  ) {
    if (!req.site) throw new NotFoundException('Site neconfigurat');
    // Kick-off în background și răspuns imediat — admin face polling pe status.
    // Generare sincronă ar dura 5-10 min și ar depăși orice timeout HTTP.
    return this.svc.startBulk(req.site, { regenerate: !!body.regenerate });
  }

  @Get('regenerate-status')
  async regenerateStatus(@Req() req: Request) {
    if (!req.site) throw new NotFoundException('Site neconfigurat');
    return this.svc.bulkJob(req.site.id) ?? { status: 'idle' };
  }

  @Post(':slug/regenerate')
  @HttpCode(200)
  async regenerateOne(@Req() req: Request, @Param('slug') slug: string) {
    if (!req.site) throw new NotFoundException('Site neconfigurat');
    const result = await this.svc.regenerateOne(req.site, slug);
    if (!result) throw new NotFoundException('Slug invalid sau OpenAI indisponibil');
    return result;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      title: string;
      metaDescription: string;
      h1: string;
      excerpt: string;
      contentMd: string;
      published: boolean;
    }>,
  ) {
    const result = await this.svc.updateManual(id, body);
    if (!result) throw new NotFoundException('Pagina nu există');
    return result;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.svc.delete(id);
    return { ok: true };
  }
}
