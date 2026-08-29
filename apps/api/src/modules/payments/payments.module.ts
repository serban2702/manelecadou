import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { Payment } from './payment.entity';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { AuthModule } from '../auth/auth.module';
import { PromoModule } from '../promo/promo.module';
import { SitesModule } from '../sites/sites.module';
import { GenerationsModule } from '../generations/generations.module';
import { TiktokModule } from '../tiktok/tiktok.module';
import { GuestSessionsModule } from '../guest-sessions/guest-sessions.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { MetaCapiModule } from '../meta-capi/meta-capi.module';
import { FxModule } from '../fx/fx.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment]),
    ConfigModule,
    AuthModule,
    PromoModule,
    SitesModule,
    forwardRef(() => GenerationsModule),
    TiktokModule,
    GuestSessionsModule,
    AnalyticsModule,
    MetaCapiModule,
    FxModule,
  ],
  providers: [PaymentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService, TypeOrmModule],
})
export class PaymentsModule {}
