import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsEvent } from './analytics-event.entity';
import { AnalyticsSession } from './analytics-session.entity';
import { Payment } from '../payments/payment.entity';
import { User } from '../users/user.entity';
import { AnalyticsService } from './analytics.service';
import { AnalyticsAdminController, AnalyticsPublicController } from './analytics.controller';
import { AnalyticsForwarders } from './forwarders';
import { GeoIpService } from './geoip.service';
import { AdminGuard } from '../../common/admin.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AnalyticsEvent, AnalyticsSession, Payment, User]),
    ConfigModule,
    AuthModule,
  ],
  providers: [AnalyticsService, AnalyticsForwarders, AdminGuard, GeoIpService],
  controllers: [AnalyticsPublicController, AnalyticsAdminController],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
