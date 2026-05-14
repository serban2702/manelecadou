import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeoPage } from './seo-page.entity';
import { SeoPagesService } from './seo-pages.service';
import { SeoPageGeneratorService } from './seo-page-generator.service';
import {
  PublicSeoPagesController,
  AdminSeoPagesController,
} from './seo-pages.controller';
import { SettingsModule } from '../settings/settings.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([SeoPage]), SettingsModule, AuthModule],
  providers: [SeoPagesService, SeoPageGeneratorService],
  controllers: [PublicSeoPagesController, AdminSeoPagesController],
  exports: [SeoPagesService],
})
export class SeoPagesModule {}
