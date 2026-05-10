import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { IsArray } from 'class-validator';
import { AdminGuard } from '../../common/admin.guard';
import { SettingsService } from './settings.service';

class UpdateSettingsDto {
  @IsArray()
  updates!: Array<{ key: string; value: string; clear?: boolean }>;
}

@UseGuards(AdminGuard)
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly svc: SettingsService) {}

  @Get()
  list() {
    return this.svc.listForAdmin();
  }

  @Patch()
  async update(@Body() dto: UpdateSettingsDto) {
    await this.svc.update(dto.updates ?? []);
    return { ok: true, count: dto.updates?.length ?? 0 };
  }
}
