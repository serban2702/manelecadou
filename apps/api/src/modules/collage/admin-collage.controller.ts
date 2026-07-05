import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';

import { CollageService } from './collage.service';
import { MAX_IMAGES, MAX_IMAGE_BYTES } from './collage.constants';
import { UploadedImage } from './collage-upload.service';
import { CollageTrack } from './video-collage.entity';
import { AdminGuard } from '../../common/admin.guard';

/**
 * Operații de colaj video pentru ADMIN (dashboard). Bypass ownership (protejat de
 * AdminGuard, cross-tenant): vezi imaginile încărcate de client + colajele,
 * încarcă imagini proprii și generează/regenerează colaje pentru orice comandă.
 */
@UseGuards(AdminGuard)
@Controller('admin/generations')
export class AdminCollageController {
  constructor(private readonly svc: CollageService) {}

  /** Toate colajele unei comenzi + imaginile sursă (URL-uri) ale fiecăruia. */
  @Get(':id/collages')
  async list(@Param('id') id: string) {
    const items = await this.svc.adminListForGeneration(id);
    return {
      collages: items.map((c) => ({
        id: c.id,
        status: c.status,
        videoUrl: c.videoUrl,
        track: c.track,
        kind: c.kind,
        aspect: c.aspect,
        imageCount: c.imageCount,
        error: c.error,
        sourceImageUrl: c.sourceImageUrl,
        images: c.images,
        createdAt: c.createdAt,
        completedAt: c.completedAt,
      })),
    };
  }

  /** Admin încarcă imagini proprii și pornește un colaj nou (max 15, ≤10MB). */
  @Post(':id/collage')
  @HttpCode(200)
  @UseInterceptors(
    FilesInterceptor('images', MAX_IMAGES, { limits: { fileSize: MAX_IMAGE_BYTES } }),
  )
  async create(
    @Param('id') id: string,
    @UploadedFiles() files: UploadedImage[] | undefined,
    @Body('track') track: string | undefined,
    @Body('aspect') aspect: string | undefined,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Lipsesc imaginile (field name: images)');
    }
    const t: CollageTrack = track === 'bonus' ? 'bonus' : 'main';
    return this.svc.adminCreateUpload({ generationId: id, track: t, aspect, files });
  }

  /**
   * Regenerează un colaj existent: cu ACELEAȘI poze (altă variantă) dacă e
   * slideshow, sau reface image_video. Creează un colaj nou, nu-l atinge pe vechi.
   */
  @Post(':id/collage/:collageId/regenerate')
  @HttpCode(200)
  async regenerate(
    @Param('collageId') collageId: string,
    @Body() body: { track?: string; aspect?: string } | undefined,
  ) {
    const track: CollageTrack | undefined =
      body?.track === 'bonus' ? 'bonus' : body?.track === 'main' ? 'main' : undefined;
    return this.svc.adminRegenerate(collageId, { track, aspect: body?.aspect });
  }
}
