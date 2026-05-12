import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/jwt.guard';
import { AdminGuard } from '../../common/admin.guard';
import { SitesService } from './sites.service';
import { Site } from './site.entity';
import { SiteSamplesService, SAMPLE_STYLES, SAMPLE_VOICES, SampleKind } from './site-samples.service';

// Public: returnează configul site-ului curent (rezolvat din Host) — folosit de web app
@Controller('public/site')
export class PublicSiteController {
  @Get()
  current(@Req() req: Request) {
    if (!req.site) throw new NotFoundException('Site neconfigurat');
    return this.serialize(req.site, /* publicOnly */ true, req);
  }

  private serialize(site: Site, publicOnly: boolean, req: Request) {
    return {
      id: site.id,
      slug: site.slug,
      domain: site.domain,
      name: site.name,
      locale: site.locale,
      currency: site.currency,
      basePriceCents: site.basePriceCents,
      giftPriceCents: site.giftPriceCents,
      brand: site.brand,
      seo: site.seo,
      analytics: site.analytics,
      social: site.social,
      companyInfo: site.companyInfo,
      supportEmail: site.supportEmail,
      active: site.active,
      maintenanceMode: site.maintenanceMode,
      hiddenMode: site.hiddenMode,
      maintenanceMessage: site.maintenanceMessage ?? {},
      ipWhitelist: site.ipWhitelist ?? [],
      demoEnabled: site.demoEnabled ?? true,
      styles: site.styles ?? [],
      voices: site.voices ?? [],
      occasions: site.occasions ?? [],
      // Mostrele audio (URL public) — citite de /studio pentru carduri-le ►.
      styleSamples: site.suno?.styleSamples ?? {},
      voiceSamples: site.suno?.voiceSamples ?? {},
      // IP-ul clientului — extras din x-forwarded-for / x-real-ip / req.ip
      // pentru ca middleware-ul web să-l poată compara cu ipWhitelist.
      clientIp: extractClientIp(req),
      ...(publicOnly ? {} : {
        adminEmails: site.adminEmails,
        fromEmail: site.fromEmail,
        stripe: site.stripe,
        suno: site.suno,
        sslEnabled: site.sslEnabled,
        isDefault: site.isDefault,
        notes: site.notes,
      }),
    };
  }
}

function extractClientIp(req: Request): string | null {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const list = Array.isArray(xff) ? xff[0] : xff;
    const first = list.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real) return real.trim();
  return req.ip ?? null;
}

// Admin: CRUD complet pe site-uri
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/sites')
export class AdminSitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  async list() {
    const all = await this.sites.listAll();
    return all.map((s) => this.serializeFull(s));
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const site = await this.sites.findById(id);
    if (!site) throw new NotFoundException('Site negăsit');
    return this.serializeFull(site);
  }

  @Post()
  async create(@Body() body: Partial<Site>) {
    if (!body.domain || !body.slug || !body.name) {
      throw new BadRequestException('domain, slug și name sunt obligatorii');
    }
    const created = await this.sites.create(body);
    return this.serializeFull(created);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: Partial<Site>) {
    const updated = await this.sites.update(id, body);
    return this.serializeFull(updated);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.sites.remove(id);
    return { ok: true };
  }

  private serializeFull(s: Site) {
    return {
      id: s.id,
      slug: s.slug,
      domain: s.domain,
      name: s.name,
      locale: s.locale,
      currency: s.currency,
      basePriceCents: s.basePriceCents,
      giftPriceCents: s.giftPriceCents,
      brand: s.brand,
      seo: s.seo,
      analytics: s.analytics,
      stripe: s.stripe,
      suno: s.suno,
      social: s.social,
      companyInfo: s.companyInfo,
      fromEmail: s.fromEmail,
      supportEmail: s.supportEmail,
      adminEmails: s.adminEmails,
      active: s.active,
      isDefault: s.isDefault,
      sslEnabled: s.sslEnabled,
      maintenanceMode: s.maintenanceMode,
      hiddenMode: s.hiddenMode,
      maintenanceMessage: s.maintenanceMessage ?? {},
      ipWhitelist: s.ipWhitelist ?? [],
      demoEnabled: s.demoEnabled ?? true,
      styles: s.styles ?? [],
      voices: s.voices ?? [],
      occasions: s.occasions ?? [],
      notes: s.notes,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }
}

// Admin: management mostre audio (carduri ► din /studio)
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/sites/:id/samples')
export class AdminSiteSamplesController {
  constructor(
    private readonly sites: SitesService,
    private readonly samples: SiteSamplesService,
  ) {}

  /** Listează toate mostrele cu status: present / generating / missing.
   *  Cheile sunt derivate din site.styles/voices dacă există, altfel din
   *  listele default (SAMPLE_STYLES / SAMPLE_VOICES). */
  @Get()
  async list(@Param('id') id: string) {
    const site = await this.sites.findById(id);
    if (!site) throw new NotFoundException('Site negăsit');
    const styleSamples = site.suno?.styleSamples ?? {};
    const voiceSamples = site.suno?.voiceSamples ?? {};
    const styleKeys = (site.styles?.length ? site.styles.map((s) => s.id) : SAMPLE_STYLES) as readonly string[];
    const voiceKeys = (site.voices?.length ? site.voices.map((v) => v.id) : SAMPLE_VOICES) as readonly string[];
    const styles = styleKeys.map((key) => ({
      key,
      entry: styleSamples[key] ?? null,
      generating: this.samples.isGenerating(id, 'style', key),
    }));
    const voices = voiceKeys.map((key) => ({
      key,
      entry: voiceSamples[key] ?? null,
      generating: this.samples.isGenerating(id, 'voice', key),
    }));
    return { siteId: id, styles, voices };
  }

  /** Generează (sau regenerează) o singură mostră. Sincron — așteaptă audio finalizat.
   *  Body acceptă overrides opționale (voice, lyrics, customStylePrompt, recipientName). */
  @Post('generate')
  @HttpCode(200)
  async generate(
    @Param('id') id: string,
    @Body() body: {
      kind: SampleKind;
      key: string;
      regenerate?: boolean;
      voice?: string;
      lyrics?: string;
      customStylePrompt?: string;
      recipientName?: string;
      dedication?: string;
    },
  ) {
    if (!body?.kind || !body?.key) {
      throw new BadRequestException('kind și key sunt obligatorii');
    }
    const overrides =
      body.voice || body.lyrics || body.customStylePrompt || body.recipientName || body.dedication
        ? {
            voice: body.voice,
            lyrics: body.lyrics,
            customStylePrompt: body.customStylePrompt,
            recipientName: body.recipientName,
            dedication: body.dedication,
          }
        : undefined;
    const result = await this.samples.generateOne(id, body.kind, body.key, !!body.regenerate, overrides);
    return { ok: true, ...result };
  }

  /** Generează lyrics demo cu AI (OpenAI) folosind writerSystemPrompt al site-ului.
   *  Returnează DOAR string-ul — UI-ul îl arată în textarea editabilă. */
  @Post('preview-lyrics')
  @HttpCode(200)
  async previewLyrics(
    @Param('id') id: string,
    @Body() body: { kind: SampleKind; key: string; voice?: string; recipientName?: string; customStylePrompt?: string; dedication?: string },
  ) {
    if (!body?.kind || !body?.key) {
      throw new BadRequestException('kind și key sunt obligatorii');
    }
    return this.samples.previewLyrics(id, body.kind, body.key, {
      voiceKey: body.voice,
      recipientName: body.recipientName,
      customStylePrompt: body.customStylePrompt,
      dedication: body.dedication,
    });
  }

  /** Upload manual al unei mostre (MP3/WAV/M4A/OGG, max 25MB).
   *  Multipart/form-data: field "file" + body kind, key.
   *  Folosit când userul a generat ceva extern (ex. în UI-ul nativ Suno) și vrea
   *  să-l pună direct ca mostră, fără să consume credit prin API-ul nostru. */
  @Post('upload')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async upload(
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; size: number; mimetype: string } | undefined,
    @Body() body: { kind: SampleKind; key: string },
  ) {
    if (!file) throw new BadRequestException('Lipsește fișierul (field name: file)');
    if (!body?.kind || !body?.key) {
      throw new BadRequestException('kind și key sunt obligatorii');
    }
    const result = await this.samples.uploadOne(id, body.kind, body.key, file.buffer, file.originalname);
    return { ok: true, ...result };
  }

  /** Bulk: generează toate mostrele lipsă (sau toate dacă regenerate=true). Async. */
  @Post('generate-all')
  @HttpCode(202)
  async generateAll(
    @Param('id') id: string,
    @Body() body: { regenerate?: boolean },
  ) {
    const queued = await this.samples.generateAll(id, !!body?.regenerate);
    return { ok: true, queued, count: queued.length };
  }
}

// Endpoint INTERN, fără auth, pentru Caddy on-demand TLS hook (/ask)
// Caddy întreabă: pot să cer cert pentru domeniul X?
// Răspunsul: 200 dacă e site activ + ssl enabled, 4xx altfel.
@Controller('internal/caddy')
export class CaddyAskController {
  constructor(private readonly sites: SitesService) {}

  @Get('ask')
  async ask(@Req() req: Request) {
    const domain = (req.query.domain as string)?.toLowerCase().trim();
    if (!domain) throw new BadRequestException('missing domain');
    const site = await this.sites.findByDomain(domain);
    if (!site || !site.active || !site.sslEnabled) {
      // Caddy interpretează 4xx ca refuz → nu cere cert
      throw new NotFoundException('domain not allowed');
    }
    return { ok: true, domain: site.domain };
  }
}
