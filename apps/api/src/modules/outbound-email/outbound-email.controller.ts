import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../common/admin.guard';
import { CurrentSiteId } from '../../common/decorators';
import { OutboundEmailService } from './outbound-email.service';

@UseGuards(AdminGuard)
@Controller('admin/outbound-emails')
export class OutboundEmailController {
  constructor(private readonly svc: OutboundEmailService) {}

  @Get()
  async list(
    @CurrentSiteId() siteId: string | null,
    @Query('status') status?: 'queued' | 'sent' | 'failed',
    @Query('kind') kind?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.svc.list({
      siteId,
      status,
      kind,
      q,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('stats')
  stats(@CurrentSiteId() siteId: string | null) {
    return this.svc.stats(siteId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const row = await this.svc.findOne(id);
    if (!row) return { notFound: true };
    return row;
  }
}
