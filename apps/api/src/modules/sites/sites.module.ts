import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Site } from './site.entity';
import { SitesService } from './sites.service';
import { AdminSitesController, AdminSiteSamplesController, CaddyAskController, PublicSiteController } from './sites.controller';
import { SiteContextMiddleware } from './site-context.middleware';
import { SiteSamplesService } from './site-samples.service';
import { SiteBrandUploadService } from './site-brand-upload.service';
import { ExperienceAssetUploadService } from './experience-asset-upload.service';
import { SiteRolloutService } from './site-rollout.service';
import { AdminSiteRolloutController } from './site-rollout.controller';
import { SunoModule } from '../suno/suno.module';
import { LyricsModule } from '../lyrics/lyrics.module';
// SettingsModule e @Global() — SettingsService e injectabil în SiteSamplesService
// fără import explicit. NU adăuga `SettingsModule` în `imports` aici: AuthModule
// importă SitesModule, deci ar produce ciclu SitesModule → SettingsModule →
// AuthModule → SitesModule.

@Module({
  imports: [
    TypeOrmModule.forFeature([Site]),
    SunoModule,
    LyricsModule,
    // JwtModule local cu același secret ca AuthModule — middleware-ul are nevoie să
    // decodeze JWT-ul ÎNAINTE de guards (pentru anti-abuz pe siteId per-user).
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [SitesService, SiteSamplesService, SiteBrandUploadService, ExperienceAssetUploadService, SiteRolloutService],
  controllers: [PublicSiteController, AdminSitesController, AdminSiteSamplesController, CaddyAskController, AdminSiteRolloutController],
  exports: [SitesService, TypeOrmModule],
})
export class SitesModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Aplicăm middleware-ul pe toate rutele — atașează req.site + req.siteId
    consumer.apply(SiteContextMiddleware).forRoutes('*');
  }
}
