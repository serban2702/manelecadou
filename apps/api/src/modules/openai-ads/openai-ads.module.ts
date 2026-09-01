import { Module } from '@nestjs/common';
import { OpenAiAdsService } from './openai-ads.service';
import { OpenAiAdsAdminController } from './openai-ads.controller';
import { SitesModule } from '../sites/sites.module';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from '../../common/admin.guard';

/**
 * ChatGPT Ads — partea server (Conversions API). Pixelul din browser stă în
 * `apps/web/app/layout.tsx`; aici e doar oglinda server-side a conversiilor.
 */
@Module({
  // `AuthModule` pentru `JwtService`, de care are nevoie `AdminGuard` la testul
  // din admin. Fără el, Nest cade la boot, nu la primul request.
  imports: [SitesModule, AuthModule],
  providers: [OpenAiAdsService, AdminGuard],
  controllers: [OpenAiAdsAdminController],
  exports: [OpenAiAdsService],
})
export class OpenAiAdsModule {}
