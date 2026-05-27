import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AdminGuard } from '../../common/admin.guard';
import { CurrentSiteId } from '../../common/decorators';
import {
  SITE_DEMO_CATEGORIES,
  SiteDemoCategory,
} from './site-demo.entity';
import { SiteDemosService } from './site-demos.service';

class CreateOrUpdateDemoDto {
  @IsOptional() @IsString() @MaxLength(200)
  title?: string;

  @IsOptional() @IsString() @MaxLength(120)
  fromName?: string | null;

  @IsOptional() @IsString() @MaxLength(120)
  toName?: string | null;

  @IsOptional() @IsIn(SITE_DEMO_CATEGORIES as readonly string[])
  category?: SiteDemoCategory;

  @IsOptional() @IsString() @MaxLength(20000)
  lyrics?: string | null;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  previewStartSec?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  audioDurationSec?: number | null;

  @IsOptional() @Type(() => Number) @IsInt()
  sortOrder?: number;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  active?: boolean;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  featuredOnHome?: boolean;

  // Admin override: când e setat din selectorul de site, forțează siteId
  // (altfel folosim siteId-ul rezolvat din Host/header de SiteContextMiddleware).
  @IsOptional() @IsString()
  siteId?: string;
}

type MulterFile = {
  buffer: Buffer;
  originalname: string;
  size: number;
  mimetype: string;
};

function coerceBool(v: any): boolean | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
  }
  return undefined;
}

function coerceInt(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Public — citit de web app (pagina /asculta + popup homepage). Site curent
 * rezolvat automat de SiteContextMiddleware din Host header.
 */
@Controller('public/site-demos')
export class PublicSiteDemosController {
  constructor(private readonly demos: SiteDemosService) {}

  @Get()
  async list(@CurrentSiteId() siteId: string | null) {
    if (!siteId) return { items: [] };
    const items = await this.demos.listForSite(siteId);
    return { items: items.map(serializePublic) };
  }

  @Get('featured')
  async featured(@CurrentSiteId() siteId: string | null) {
    if (!siteId) return { items: [] };
    const items = await this.demos.listFeatured(siteId);
    return { items: items.map(serializePublic) };
  }
}

/**
 * Admin — CRUD pentru demo-uri. Acceptă selector cross-site via body.siteId
 * (admin poate adăuga demo-uri pe orice site din UI).
 */
@Controller('admin/site-demos')
@UseGuards(AdminGuard)
export class AdminSiteDemosController {
  constructor(private readonly demos: SiteDemosService) {}

  @Get()
  async list(@Query('siteId') siteId?: string) {
    const items = await this.demos.listAdmin(siteId || undefined);
    return { items };
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.demos.getOne(id);
  }

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'audio', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
      ],
      { limits: { fileSize: 15 * 1024 * 1024 } },
    ),
  )
  async create(
    @Body() body: Record<string, any>,
    @UploadedFiles()
    files: { audio?: MulterFile[]; thumbnail?: MulterFile[] },
    @CurrentSiteId() ctxSiteId: string | null,
  ) {
    const audio = files?.audio?.[0];
    if (!audio) throw new BadRequestException('Lipsește fișierul audio (field: audio)');
    const thumb = files?.thumbnail?.[0];

    const siteId = (body.siteId && String(body.siteId)) || ctxSiteId;
    if (!siteId) throw new BadRequestException('Lipsește siteId');

    const demo = await this.demos.create({
      siteId,
      input: {
        title: String(body.title ?? ''),
        fromName: body.fromName ?? null,
        toName: body.toName ?? null,
        category: body.category as SiteDemoCategory,
        lyrics: body.lyrics ?? null,
        previewStartSec: coerceInt(body.previewStartSec) ?? 0,
        audioDurationSec: coerceInt(body.audioDurationSec) ?? null,
        sortOrder: coerceInt(body.sortOrder) ?? 0,
        active: coerceBool(body.active) ?? true,
        featuredOnHome: coerceBool(body.featuredOnHome) ?? false,
      },
      audioBuffer: audio.buffer,
      audioMime: audio.mimetype,
      audioOriginalName: audio.originalname,
      thumbBuffer: thumb?.buffer ?? null,
      thumbMime: thumb?.mimetype ?? null,
    });
    return demo;
  }

  @Patch(':id')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'audio', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
      ],
      { limits: { fileSize: 15 * 1024 * 1024 } },
    ),
  )
  async update(
    @Param('id') id: string,
    @Body() body: Record<string, any>,
    @UploadedFiles()
    files: { audio?: MulterFile[]; thumbnail?: MulterFile[] },
  ) {
    const audio = files?.audio?.[0];
    const thumb = files?.thumbnail?.[0];
    const patch: any = {};
    if (body.title !== undefined) patch.title = String(body.title);
    if (body.fromName !== undefined) patch.fromName = body.fromName;
    if (body.toName !== undefined) patch.toName = body.toName;
    if (body.category !== undefined) patch.category = body.category;
    if (body.lyrics !== undefined) patch.lyrics = body.lyrics;
    if (body.previewStartSec !== undefined)
      patch.previewStartSec = coerceInt(body.previewStartSec);
    if (body.audioDurationSec !== undefined)
      patch.audioDurationSec = coerceInt(body.audioDurationSec);
    if (body.sortOrder !== undefined)
      patch.sortOrder = coerceInt(body.sortOrder);
    if (body.active !== undefined) patch.active = coerceBool(body.active);
    if (body.featuredOnHome !== undefined)
      patch.featuredOnHome = coerceBool(body.featuredOnHome);

    return this.demos.update(id, patch, {
      audioBuffer: audio?.buffer,
      audioMime: audio?.mimetype,
      audioOriginalName: audio?.originalname,
      thumbBuffer: thumb?.buffer,
      thumbMime: thumb?.mimetype,
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.demos.remove(id);
    return { ok: true };
  }
}

function serializePublic(d: any) {
  // Nu expunem siteId / featuredOnHome / sortOrder către clienți publici —
  // sunt detalii interne. Lyrics e public, e parte din experiență.
  return {
    id: d.id,
    title: d.title,
    fromName: d.fromName,
    toName: d.toName,
    category: d.category,
    lyrics: d.lyrics,
    audioUrl: d.audioUrl,
    audioDurationSec: d.audioDurationSec,
    previewStartSec: d.previewStartSec,
    thumbnailUrl: d.thumbnailUrl,
  };
}
