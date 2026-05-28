import { Module } from '@nestjs/common';
import { SitesModule } from '../sites/sites.module';
import { MetaCapiController } from './meta-capi.controller';
import { MetaCapiService } from './meta-capi.service';

@Module({
  imports: [SitesModule],
  controllers: [MetaCapiController],
  providers: [MetaCapiService],
  exports: [MetaCapiService],
})
export class MetaCapiModule {}
