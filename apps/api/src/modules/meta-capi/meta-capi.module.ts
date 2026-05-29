import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SitesModule } from '../sites/sites.module';
import { Payment } from '../payments/payment.entity';
import { MetaCapiController } from './meta-capi.controller';
import { MetaCapiService } from './meta-capi.service';

@Module({
  imports: [SitesModule, TypeOrmModule.forFeature([Payment])],
  controllers: [MetaCapiController],
  providers: [MetaCapiService],
  exports: [MetaCapiService],
})
export class MetaCapiModule {}
