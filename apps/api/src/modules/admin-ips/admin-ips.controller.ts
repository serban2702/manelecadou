import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { AdminGuard } from '../../common/admin.guard';
import { AdminIp } from './admin-ip.entity';
import { AdminIpsService } from './admin-ips.service';
import { InternalTrafficService } from './internal-traffic.service';

class PatchIpDto {
  @IsBoolean() @IsOptional()
  enabled?: boolean;

  @IsString() @IsOptional() @MaxLength(120)
  label?: string;
}

@UseGuards(AdminGuard)
@Controller('admin/admin-ips')
export class AdminIpsController {
  constructor(
    private readonly svc: AdminIpsService,
    private readonly internal: InternalTrafficService,
  ) {}

  @Get()
  async list() {
    const rows = await this.svc.list();
    return rows.map((r) => ({
      id: r.id,
      ip: r.ip,
      label: r.label,
      enabled: r.enabled,
      lastSeenAt: r.lastSeenAt,
      createdAt: r.createdAt,
    }));
  }

  @Patch(':id')
  async patch(@Param('id') id: string, @Body() dto: PatchIpDto) {
    let row: AdminIp | null = null;
    if (typeof dto.enabled === 'boolean') row = await this.svc.setEnabled(id, dto.enabled);
    if (dto.label !== undefined) row = await this.svc.setLabel(id, dto.label);
    return { ok: !!row };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return { ok: await this.svc.remove(id) };
  }

  /**
   * Marchează retroactiv sesiunile vechi venite de pe IP-urile cunoscute.
   *
   * Explicit, la cerere: rapoartele istorice se schimbă după ce apeși, inclusiv
   * cifrele pe care le-ai comparat până acum.
   */
  @Post('backfill')
  async backfill() {
    return this.internal.backfill();
  }

  /** Câte sesiuni ar fi afectate de un backfill, fără să schimbe nimic. */
  @Get('backfill/preview')
  async preview() {
    return this.internal.previewBackfill();
  }
}
