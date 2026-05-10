import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AdminGuard } from '../../common/admin.guard';
import { DatabaseAdminService } from './database-admin.service';

class CreateBackupDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  label?: string;
}

@UseGuards(AdminGuard)
@Controller('admin/database')
export class DatabaseAdminController {
  constructor(
    private readonly db: DatabaseAdminService,
    private readonly config: ConfigService,
  ) {}

  @Get('info')
  info() {
    return {
      env: this.config.get<string>('NODE_ENV') ?? 'development',
      host: this.config.get<string>('POSTGRES_HOST'),
      database: this.config.get<string>('POSTGRES_DB'),
      resetAllowed: this.config.get<string>('NODE_ENV') !== 'production',
    };
  }

  @Get('backups')
  list() {
    return this.db.listBackups();
  }

  @Post('backups')
  create(@Body() body: CreateBackupDto) {
    return this.db.createBackup(body.label);
  }

  @Get('backups/:name/download')
  async download(@Param('name') name: string, @Res() res: Response) {
    const { stream, size } = await this.db.backupStream(name);
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Length', String(size));
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    stream.pipe(res);
  }

  @Delete('backups/:name')
  async remove(@Param('name') name: string) {
    await this.db.deleteBackup(name);
    return { ok: true };
  }

  @Post('backups/:name/restore')
  restore(@Param('name') name: string) {
    return this.db.restoreBackup(name);
  }

  @Post('reset')
  reset() {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('Reset interzis pe production');
    }
    return this.db.resetAndReseed();
  }
}
