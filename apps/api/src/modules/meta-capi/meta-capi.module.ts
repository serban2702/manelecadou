import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { MetaCapiController } from './meta-capi.controller';
import { MetaCapiService } from './meta-capi.service';

@Module({
  imports: [SettingsModule],
  controllers: [MetaCapiController],
  providers: [MetaCapiService],
  exports: [MetaCapiService],
})
export class MetaCapiModule {}
