import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SeederModule } from '../../database/seeder/seeder.module';
import { SettingsModule } from '../settings/settings.module';
import { AdminGuard } from '../../common/admin.guard';
import { DatabaseAdminController } from './database-admin.controller';
import { DatabaseAdminService } from './database-admin.service';

@Module({
  imports: [AuthModule, SeederModule, SettingsModule],
  controllers: [DatabaseAdminController],
  providers: [DatabaseAdminService, AdminGuard],
})
export class DatabaseAdminModule {}
