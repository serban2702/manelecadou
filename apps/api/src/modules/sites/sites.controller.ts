import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/jwt.guard';
import { AdminGuard } from '../../common/admin.guard';
import { SitesService } from './sites.service';
import { Site } from './site.entity';
import { SiteSamplesService, SAMPLE_STYLES, SAMPLE_VOICES, SampleKind } from './site-samples.service';
import { SiteBrandUploadService, BrandAssetField } from './site-brand-upload.service';
import { encryptSecret } from '../../common/crypto.util';

/**
 * Placeholder folosit de admin UI pentru câmpurile criptate (apiKey, smtp.pass):
 * dacă valoarea care vine în PATCH e exact acest string, ÎNSEAMNĂ că adminul nu
 * a editat câmpul → păstrăm valoarea criptată existentă din DB. Dacă vine altă
 * valoare non-vidă, o criptăm și o salvăm. Empty string explicit = clear.
 */
const MASKED_SECRET = '__MASKED__';

// Public: returnează configul site-ului curent (rezolvat din Host) — folosit de web app
@Controller('public/site')
export class PublicSiteController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  current(@Req() req: Request) {
    if (!req.site) throw new NotFoundException('Site neconfigurat');
    return this.serialize(req.site, /* publicOnly */ true, req);
  }

  /**
   * Listă de țări disponibile pentru selector-ul din topbar.
   * Pentru fiecare locale, întoarce site-ul cel mai vechi (după createdAt) care
   * e `active && !hiddenMode && !maintenanceMode` — EXCEPȚIE: dacă IP-ul
   * clientului e în `ipWhitelist`-ul site-ului, restricțiile sunt sărite
   * (același comportament ca middleware-ul de maintenance/hidden).
   */
  @Get('countries')
  async countries(@Req() req: Request) {
    const all = await this.sites.listAll();
    const clientIp = extractClientIp(req);
    const visible = all.filter((s) => {
      if (isIpWhitelisted(clientIp, s.ipWhitelist ?? [])) return true;
      return s.active && !s.hiddenMode && !s.maintenanceMode;
    });
    const oldestByLocale = new Map<string, Site>();
    for (const s of visible) {
      const existing = oldestByLocale.get(s.locale);
      if (!existing || s.createdAt.getTime() < existing.createdAt.getTime()) {
        oldestByLocale.set(s.locale, s);
      }
    }
    return Array.from(oldestByLocale.values()).map((s) => ({
      locale: s.locale,
      domain: s.domain,
      name: s.name,
    }));
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
      standardPriceCents: site.standardPriceCents ?? 0,
      premiumExtraCents: site.premiumExtraCents ?? 2000,
      tipSurchargeCapCents: site.tipSurchargeCapCents ?? 5000,
      tipSurchargePercent: site.tipSurchargePercent ?? 5,
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
      topSource: site.topSource ?? 'seed',
      styles: site.styles ?? [],
      voices: site.voices ?? [],
      occasions: site.occasions ?? [],
      testimonials: site.testimonials ?? [],
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

/**
 * Match exact sau prefix-wildcard ("192.168.*"). Echivalent cu helper-ul
 * `isIpWhitelisted` din `apps/web/lib/site-shared.ts` — duplicat aici fiindcă
 * API-ul nu importă cod din workspace-ul web.
 */
function isIpWhitelisted(clientIp: string | null, whitelist: string[]): boolean {
  if (!clientIp || !whitelist || whitelist.length === 0) return false;
  const ip = clientIp.trim();
  for (const raw of whitelist) {
    const entry = (raw ?? '').trim();
    if (!entry) continue;
    if (entry === ip) return true;
    if (entry.endsWith('*') && ip.startsWith(entry.slice(0, -1))) return true;
  }
  return false;
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
  constructor(
    private readonly sites: SitesService,
    private readonly brandUpload: SiteBrandUploadService,
  ) {}

  /** Upload pentru asset-urile vizuale de brand (logo, OG image, favicon,
   *  email banner). Salvează fișierul, generează URL public, persistă în
   *  `site.brand[field]`. Răspunde cu URL-ul nou + brand-ul actualizat. */
  @Post(':id/brand/upload')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadBrandAsset(
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; size: number; mimetype: string } | undefined,
    @Body() body: { field: BrandAssetField },
  ) {
    if (!file) throw new BadRequestException('Lipsește fișierul (field name: file)');
    if (!body?.field) throw new BadRequestException('field este obligatoriu');
    if (!SiteBrandUploadService.isAllowedField(body.field)) {
      throw new BadRequestException(`Câmp invalid: ${body.field}`);
    }
    const result = await this.brandUpload.uploadAsset(id, body.field, file.buffer, file.originalname);
    return { ok: true, ...result };
  }

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
    // Mostrele audio (suno.styleSamples / suno.voiceSamples) sunt gestionate
    // EXCLUSIV prin /samples/* — orice payload care le-ar suprascrie din PATCH-ul
    // generic e blocat aici. Altfel, dacă userul ținea formularul deschis în
    // timp ce o generare în curs salva o mostră nouă, save-ul de la „Salvează
    // modificările" trimitea înapoi `suno.styleSamples` stale și ștergea mostra
    // proaspăt persistată. Acum: păstrăm valorile curente din DB pentru aceste
    // două sub-câmpuri, indiferent ce trimite clientul.
    if (body.suno && typeof body.suno === 'object') {
      const current = await this.sites.findById(id);
      const incoming = body.suno as Partial<Site['suno']> & {
        styleSamples?: unknown;
        voiceSamples?: unknown;
      };
      const { styleSamples: _ss, voiceSamples: _vs, ...sunoSafe } = incoming;
      body.suno = {
        ...(sunoSafe as Site['suno']),
        styleSamples: current?.suno?.styleSamples ?? {},
        voiceSamples: current?.suno?.voiceSamples ?? {},
      };
    }
    // Mail config: secretele (mailgun.apiKey, smtp.pass) sunt criptate la repaus.
    // Adminul UI le primește mascate (MASKED_SECRET) → nu trebuie suprascrise
    // accidental cu placeholder. Dacă userul a editat câmpul, criptăm valoarea.
    if (body.mailConfig && typeof body.mailConfig === 'object') {
      const current = await this.sites.findById(id);
      body.mailConfig = this.normalizeMailConfig(body.mailConfig, current?.mailConfig);
    }
    const updated = await this.sites.update(id, body);
    return this.serializeFull(updated);
  }

  /** Curăță / criptează secretele din mailConfig folosind ghid:
   *  - MASKED_SECRET sau undefined → păstrează valoarea criptată existentă
   *  - string non-empty → criptează cu encryptSecret() și salvează
   *  - empty string '' → clear (șterge secretul) */
  private normalizeMailConfig(
    incoming: Partial<Site['mailConfig']>,
    current?: Site['mailConfig'],
  ): Site['mailConfig'] {
    const out: Site['mailConfig'] = {
      provider: incoming.provider ?? current?.provider ?? null,
      fromEmail: incoming.fromEmail ?? current?.fromEmail,
      fromName: incoming.fromName ?? current?.fromName,
      replyTo: incoming.replyTo ?? current?.replyTo,
    };
    if (incoming.mailgun || current?.mailgun) {
      const mg = incoming.mailgun ?? {};
      const curMg = current?.mailgun ?? {};
      out.mailgun = {
        domain: mg.domain ?? curMg.domain,
        region: mg.region ?? curMg.region,
        apiUrl: mg.apiUrl ?? curMg.apiUrl,
        apiKey: this.handleSecret(mg.apiKey, curMg.apiKey),
      };
    }
    if (incoming.smtp || current?.smtp) {
      const s = incoming.smtp ?? {};
      const curS = current?.smtp ?? {};
      out.smtp = {
        host: s.host ?? curS.host,
        port: s.port ?? curS.port,
        secure: s.secure ?? curS.secure,
        user: s.user ?? curS.user,
        pass: this.handleSecret(s.pass, curS.pass),
      };
    }
    return out;
  }

  private handleSecret(incoming: string | undefined, current: string | undefined): string | undefined {
    if (incoming === undefined || incoming === MASKED_SECRET) return current;
    if (incoming === '') return undefined; // explicit clear
    return encryptSecret(incoming);
  }

  /** Adminul nu trebuie să vadă secretele în plain. Dacă există un secret
   *  setat (varianta criptată), îl întoarcem ca MASKED_SECRET; altfel `''`. */
  private serializeMailConfig(mc: Site['mailConfig'] | null | undefined): Site['mailConfig'] {
    const m = mc ?? {};
    const out: Site['mailConfig'] = {
      provider: m.provider ?? null,
      fromEmail: m.fromEmail,
      fromName: m.fromName,
      replyTo: m.replyTo,
    };
    if (m.mailgun) {
      out.mailgun = {
        domain: m.mailgun.domain,
        region: m.mailgun.region,
        apiUrl: m.mailgun.apiUrl,
        apiKey: m.mailgun.apiKey ? MASKED_SECRET : '',
      };
    }
    if (m.smtp) {
      out.smtp = {
        host: m.smtp.host,
        port: m.smtp.port,
        secure: m.smtp.secure,
        user: m.smtp.user,
        pass: m.smtp.pass ? MASKED_SECRET : '',
      };
    }
    return out;
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
      standardPriceCents: s.standardPriceCents ?? 0,
      premiumExtraCents: s.premiumExtraCents ?? 2000,
      tipSurchargeCapCents: s.tipSurchargeCapCents ?? 5000,
      tipSurchargePercent: s.tipSurchargePercent ?? 5,
      giftPriceCents: s.giftPriceCents,
      brand: s.brand,
      seo: s.seo,
      analytics: s.analytics,
      analyticsSecrets: s.analyticsSecrets ?? {},
      stripe: s.stripe,
      suno: s.suno,
      social: s.social,
      companyInfo: s.companyInfo,
      fromEmail: s.fromEmail,
      supportEmail: s.supportEmail,
      adminEmails: s.adminEmails,
      mailConfig: this.serializeMailConfig(s.mailConfig),
      active: s.active,
      isDefault: s.isDefault,
      sslEnabled: s.sslEnabled,
      maintenanceMode: s.maintenanceMode,
      hiddenMode: s.hiddenMode,
      maintenanceMessage: s.maintenanceMessage ?? {},
      ipWhitelist: s.ipWhitelist ?? [],
      demoEnabled: s.demoEnabled ?? true,
      topSource: s.topSource ?? 'seed',
      styles: s.styles ?? [],
      voices: s.voices ?? [],
      occasions: s.occasions ?? [],
      testimonials: s.testimonials ?? [],
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
      style?: string;
      occasion?: string;
      message?: string;
      tipAmount?: number;
      premium?: boolean;
      vocalGender?: 'm' | 'f';
    },
  ) {
    if (!body?.kind || !body?.key) {
      throw new BadRequestException('kind și key sunt obligatorii');
    }
    const hasAnyOverride =
      body.voice ||
      body.lyrics ||
      body.customStylePrompt ||
      body.recipientName ||
      body.dedication ||
      body.style ||
      body.occasion ||
      body.message ||
      typeof body.tipAmount === 'number' ||
      typeof body.premium === 'boolean' ||
      body.vocalGender;
    const overrides = hasAnyOverride
      ? {
          voice: body.voice,
          lyrics: body.lyrics,
          customStylePrompt: body.customStylePrompt,
          recipientName: body.recipientName,
          dedication: body.dedication,
          style: body.style,
          occasion: body.occasion,
          message: body.message,
          tipAmount: body.tipAmount,
          premium: body.premium,
          vocalGender: body.vocalGender,
        }
      : undefined;
    const result = await this.samples.generateOne(id, body.kind, body.key, !!body.regenerate, overrides);
    // Două forme posibile:
    //  - reused=true → întoarcem entry-ul existent (UI-ul nu deschide popup),
    //  - reused=false → întoarcem candidații (Suno generează 2 piese); userul
    //    alege una în SampleChooserDialog → POST /samples/commit.
    return { ok: true, ...result };
  }

  /** Finalizează generarea: userul a ales un track din SampleChooserDialog.
   *  Descărcăm acel mp3 pe disc și-l persistăm atomic (UPDATE JSONB partial). */
  @Post('commit')
  @HttpCode(200)
  async commit(
    @Param('id') id: string,
    @Body() body: {
      kind: SampleKind;
      key: string;
      audioUrl: string;
      audioId?: string;
      sunoTaskId: string;
      durationSec?: number;
    },
  ) {
    if (!body?.kind || !body?.key) {
      throw new BadRequestException('kind și key sunt obligatorii');
    }
    if (!body?.audioUrl || !body?.sunoTaskId) {
      throw new BadRequestException('audioUrl și sunoTaskId sunt obligatorii');
    }
    const result = await this.samples.commitChoice(id, body.kind, body.key, {
      audioUrl: body.audioUrl,
      audioId: body.audioId,
      sunoTaskId: body.sunoTaskId,
      durationSec: body.durationSec,
    });
    return { ok: true, ...result };
  }

  /** Actualizează secunda de start pentru o mostră existentă (skip intro).
   *  Body: { kind, key, startSec } — startSec >= 0 (în secunde). */
  @Patch('start-sec')
  @HttpCode(200)
  async updateStartSec(
    @Param('id') id: string,
    @Body() body: { kind: SampleKind; key: string; startSec: number },
  ) {
    if (!body?.kind || !body?.key) {
      throw new BadRequestException('kind și key sunt obligatorii');
    }
    const startSec = Number(body.startSec);
    if (!Number.isFinite(startSec) || startSec < 0 || startSec > 600) {
      throw new BadRequestException('startSec trebuie să fie între 0 și 600');
    }
    const entry = await this.samples.updateStartSec(id, body.kind, body.key, startSec);
    return { ok: true, entry };
  }

  /** Generează lyrics demo cu AI (OpenAI) folosind writerSystemPrompt al site-ului.
   *  Returnează DOAR string-ul — UI-ul îl arată în textarea editabilă. */
  @Post('preview-lyrics')
  @HttpCode(200)
  async previewLyrics(
    @Param('id') id: string,
    @Body() body: {
      kind: SampleKind;
      key: string;
      voice?: string;
      recipientName?: string;
      customStylePrompt?: string;
      dedication?: string;
      style?: string;
      occasion?: string;
      message?: string;
      tipAmount?: number;
    },
  ) {
    if (!body?.kind || !body?.key) {
      throw new BadRequestException('kind și key sunt obligatorii');
    }
    return this.samples.previewLyrics(id, body.kind, body.key, {
      voiceKey: body.voice,
      recipientName: body.recipientName,
      customStylePrompt: body.customStylePrompt,
      dedication: body.dedication,
      style: body.style,
      occasion: body.occasion,
      message: body.message,
      tipAmount: body.tipAmount,
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

  /** Șterge toate mostrele audio (fișiere MP3 + intrările din DB). */
  @Delete()
  @HttpCode(200)
  async clearAll(@Param('id') id: string) {
    const result = await this.samples.clearAllSamples(id);
    return { ok: true, ...result };
  }

  /** Generează un Persona Suno pentru o voce din site, folosind mostra audio
   *  existentă a vocii. Salvează personaId pe site.voices[].sunoPersonaId. */
  @Post('voices/:voiceId/generate-persona')
  @HttpCode(200)
  async generatePersona(
    @Param('id') id: string,
    @Param('voiceId') voiceId: string,
    @Body() body: { name?: string; description?: string; vocalStart?: number; vocalEnd?: number; style?: string },
  ) {
    const result = await this.samples.generatePersona(id, voiceId, body);
    return { ok: true, ...result };
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
