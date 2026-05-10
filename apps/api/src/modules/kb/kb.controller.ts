import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AdminGuard } from '../../common/admin.guard';
import { CurrentSiteId } from '../../common/decorators';
import { KbService } from './kb.service';

class KbCreateDto {
  @IsString() @MinLength(1) @MaxLength(300) title!: string;
  @IsString() @MinLength(1) content!: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsString() lang?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

class KbUpdateDto {
  @IsOptional() @IsString() @MaxLength(300) title?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsString() lang?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

@UseGuards(AdminGuard)
@Controller('admin/kb')
export class KbController {
  constructor(private readonly svc: KbService) {}

  @Get('entries')
  list(@CurrentSiteId() siteId: string | null) {
    return this.svc.list(siteId);
  }

  @Post('entries')
  create(@Body() dto: KbCreateDto, @CurrentSiteId() siteId: string | null) {
    return this.svc.create({ ...dto, siteId });
  }

  @Patch('entries/:id')
  update(@Param('id') id: string, @Body() dto: KbUpdateDto) {
    return this.svc.update(id, dto);
  }

  @Delete('entries/:id')
  async remove(@Param('id') id: string) {
    await this.svc.delete(id);
    return { ok: true };
  }
}
