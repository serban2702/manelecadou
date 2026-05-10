import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AdminGuard } from '../../common/admin.guard';
import { CurrentSiteId } from '../../common/decorators';
import { ErrorsService } from './errors.service';

class ClientErrorDto {
  @IsString()
  @MaxLength(200)
  message!: string;
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  stack?: string;
  @IsOptional()
  @IsIn(['web', 'admin'])
  source?: 'web' | 'admin';
  @IsOptional()
  @IsIn(['error', 'warn', 'info'])
  level?: 'error' | 'warn' | 'info';
  @IsOptional()
  @IsString()
  @MaxLength(200)
  path?: string;
}

@Controller('errors')
export class ErrorsController {
  constructor(private readonly svc: ErrorsService) {}

  /**
   * Endpoint public unde frontend (web/admin) trimite erori prinse client-side.
   * Throttled puternic ca să nu fie spam-uit.
   */
  @Throttle({ short: { limit: 5, ttl: 10_000 }, medium: { limit: 60, ttl: 3_600_000 } })
  @Post('client')
  async logClient(
    @Body() body: ClientErrorDto,
    @Req() req: Request,
    @CurrentSiteId() siteId: string | null,
  ) {
    await this.svc.log({
      level: body.level ?? 'error',
      source: body.source ?? 'web',
      message: body.message,
      stack: body.stack,
      path: body.path,
      ip: (req.headers['x-forwarded-for'] as string) ?? req.ip ?? undefined,
      userAgent: req.headers['user-agent']?.toString().slice(0, 400),
      guestId: (req.headers['x-guest-id'] as string) ?? undefined,
      siteId,
    });
    return { ok: true };
  }
}

@UseGuards(AdminGuard)
@Controller('admin/errors')
export class AdminErrorsController {
  constructor(private readonly svc: ErrorsService) {}

  @Get()
  list(
    @CurrentSiteId() siteId: string | null,
    @Query('level') level?: 'error' | 'warn' | 'info',
    @Query('source') source?: 'api' | 'web' | 'admin',
    @Query('resolved') resolved?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.list({
      level,
      source,
      resolved: resolved === 'true' ? true : resolved === 'false' ? false : undefined,
      limit: limit ? Number(limit) : undefined,
      siteId,
    });
  }

  @Get('stats')
  stats(@CurrentSiteId() siteId: string | null) {
    return this.svc.stats(siteId);
  }

  @Patch(':id/resolve')
  async resolve(@Param('id') id: string) {
    await this.svc.resolve(id);
    return { ok: true };
  }

  @Patch('resolve-all')
  async resolveAll(@CurrentSiteId() siteId: string | null) {
    const affected = await this.svc.resolveAll(siteId);
    return { ok: true, affected };
  }

  @Delete()
  async clear(
    @CurrentSiteId() siteId: string | null,
    @Query('onlyResolved') onlyResolved?: string,
  ) {
    const affected = await this.svc.clear({
      siteId,
      onlyResolved: onlyResolved === 'true',
    });
    return { ok: true, affected };
  }
}
