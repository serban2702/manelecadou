import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromoCode, PromoRedemption } from './promo-code.entity';
import { PromoService } from './promo.service';
import { PromoController, AdminPromoController } from './promo.controller';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from '../../common/admin.guard';

@Module({
  imports: [TypeOrmModule.forFeature([PromoCode, PromoRedemption]), AuthModule],
  providers: [PromoService, AdminGuard],
  controllers: [PromoController, AdminPromoController],
  exports: [PromoService, TypeOrmModule],
})
export class PromoModule {}
