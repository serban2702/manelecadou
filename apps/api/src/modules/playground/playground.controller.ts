import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from '../../common/admin.guard';
import { PlaygroundRequestDto } from './playground.dto';
import { PlaygroundService } from './playground.service';

interface AuthedReq extends Request {
  user?: { id: string; email: string; role?: string };
}

@UseGuards(AdminGuard)
@Controller('admin/playground')
export class PlaygroundController {
  constructor(private readonly svc: PlaygroundService) {}

  @Get('meta')
  meta() {
    return this.svc.meta();
  }

  @Post('preview')
  preview(@Body() dto: PlaygroundRequestDto, @Req() req: AuthedReq) {
    return this.svc.preview(req.siteId, dto);
  }

  @Post('lyrics')
  writeLyrics(@Body() dto: PlaygroundRequestDto, @Req() req: AuthedReq) {
    return this.svc.writeLyrics(req.siteId, dto);
  }

  @Post('generate')
  async generate(@Body() dto: PlaygroundRequestDto, @Req() req: AuthedReq) {
    const run = await this.svc.startGenerate(req.siteId, dto, req.user?.email ?? null);
    return this.svc.serialize(run);
  }

  @Get('runs')
  async list(@Query('limit') limit: string | undefined, @Req() req: AuthedReq) {
    const items = await this.svc.listRuns(req.siteId, Number(limit) || 30);
    return { items: items.map((r) => this.svc.serialize(r)) };
  }

  @Get('runs/:id')
  async get(@Param('id') id: string, @Req() req: AuthedReq) {
    const run = await this.svc.getRun(req.siteId, id);
    return this.svc.serialize(run);
  }
}
