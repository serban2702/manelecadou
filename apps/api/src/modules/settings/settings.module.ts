import { Global, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { AppSetting } from './app-setting.entity';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from '../../common/admin.guard';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AppSetting]), ConfigModule, AuthModule],
  providers: [SettingsService, AdminGuard],
  controllers: [SettingsController],
  exports: [SettingsService],
})
export class SettingsModule implements OnModuleInit {
  constructor(private readonly svc: SettingsService) {}
  async onModuleInit(): Promise<void> {
    await this.svc.warmup();
  }
}
