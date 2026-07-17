import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsEvent } from './analytics-event.entity';
import { AnalyticsSession } from './analytics-session.entity';
import { AdSpend } from './ad-spend.entity';
import { AdPayment } from './ad-payment.entity';
import { ProfitConfig } from './profit-config.entity';
import { Payment } from '../payments/payment.entity';
import { Generation } from '../generations/generation.entity';
import { User } from '../users/user.entity';
import { SunoLog } from '../suno/suno-log.entity';
import { AnalyticsService } from './analytics.service';
import { AdSpendService } from './ad-spend.service';
import { AdPaymentService } from './ad-payment.service';
import { ProfitabilityService } from './profitability.service';
import { AnalyticsAdminController, AnalyticsPublicController } from './analytics.controller';
import { AnalyticsForwarders } from './forwarders';
import { GeoIpService } from './geoip.service';
import { AdminGuard } from '../../common/admin.guard';
import { AuthModule } from '../auth/auth.module';
import { SitesModule } from '../sites/sites.module';
import { FxModule } from '../fx/fx.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AnalyticsEvent, AnalyticsSession, AdSpend, AdPayment, ProfitConfig, Payment, Generation, User, SunoLog]),
    ConfigModule,
    AuthModule,
    SitesModule,
    FxModule,
  ],
  providers: [AnalyticsService, AdSpendService, AdPaymentService, ProfitabilityService, AnalyticsForwarders, AdminGuard, GeoIpService],
  controllers: [AnalyticsPublicController, AnalyticsAdminController],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
