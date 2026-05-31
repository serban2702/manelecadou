import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';

import { CollageService } from './collage.service';
import { MAX_IMAGES, MAX_IMAGE_BYTES } from './collage.constants';
import { UploadedImage } from './collage-upload.service';
import { CollageTrack } from './video-collage.entity';
import {
  CurrentGuestId,
  CurrentUser,
  AuthedRequestUser,
} from '../../common/decorators';
import { OptionalJwtAuthGuard } from '../../common/jwt.guard';

@Controller('generations')
export class CollageController {
  constructor(private readonly svc: CollageService) {}

  /**
   * Creează un colaj video on-demand pentru o manea finalizată.
   * Multipart: field `images` (max 15, ≤10MB fiecare) + body `track` ('main'|'bonus').
   */
  @Throttle({ short: { limit: 1, ttl: 30_000 }, medium: { limit: 10, ttl: 3_600_000 } })
  @UseGuards(OptionalJwtAuthGuard)
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
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Lipsesc imaginile (field name: images)');
    }
    const t: CollageTrack = track === 'bonus' ? 'bonus' : 'main';
    return this.svc.create({
      generationId: id,
      track: t,
      aspect,
      files,
      ctx: { userId: user?.id ?? null, guestId: user ? null : guestId },
    });
  }

  /**
   * Creează un image-video: o singură poză de share (aleasă) statică pe toată
   * melodia. Body: { track, aspect, imageUrl }.
   */
  @Throttle({ short: { limit: 2, ttl: 30_000 }, medium: { limit: 20, ttl: 3_600_000 } })
  @UseGuards(OptionalJwtAuthGuard)
  @Post(':id/collage/image-video')
  @HttpCode(200)
  async imageVideo(
    @Param('id') id: string,
    @Body() body: { track?: string; aspect?: string; imageUrl?: string },
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
  ) {
    if (!body?.imageUrl) throw new BadRequestException('Lipsește imageUrl');
    const t: CollageTrack = body.track === 'bonus' ? 'bonus' : 'main';
    return this.svc.createImageVideo({
      generationId: id,
      track: t,
      aspect: body.aspect,
      imageUrl: body.imageUrl,
      ctx: { userId: user?.id ?? null, guestId: user ? null : guestId },
    });
  }

  /** Cel mai recent colaj al unei manele (status + videoUrl). */
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/collage/latest')
  async latest(
    @Param('id') id: string,
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
    @Headers('x-unlock-password') password?: string,
  ) {
    const c = await this.svc.latestForGeneration(id, {
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
      password: password ?? null,
    });
    if (!c) return { collage: null };
    return { collage: this.toDto(c) };
  }

  /** Toate colajele + image-videos ale unei manele (owner sau cine are parola). */
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/collage/list')
  async list(
    @Param('id') id: string,
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
    @Headers('x-unlock-password') password?: string,
  ) {
    const items = await this.svc.listForGeneration(id, {
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
      password: password ?? null,
    });
    return { collages: items.map((c) => this.toDto(c)) };
  }

  private toDto(c: {
    id: string;
    status: string;
    videoUrl: string | null;
    track: string;
    kind: string;
    aspect: string;
    imageCount: number;
    error: string | null;
  }) {
    return {
      id: c.id,
      status: c.status,
      videoUrl: c.videoUrl,
      track: c.track,
      kind: c.kind,
      aspect: c.aspect,
      imageCount: c.imageCount,
      error: c.error,
    };
  }

  /** Un colaj anume (polling pe status). */
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/collage/:collageId')
  async getOne(
    @Param('id') id: string,
    @Param('collageId') collageId: string,
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
    @Headers('x-unlock-password') password?: string,
  ) {
    const c = await this.svc.getForGeneration(id, collageId, {
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
      password: password ?? null,
    });
    return this.toDto(c);
  }
}
