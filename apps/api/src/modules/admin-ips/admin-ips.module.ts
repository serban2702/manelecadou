import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AdminIp } from './admin-ip.entity';
import { AdminIpsService } from './admin-ips.service';
import { AdminIpsController } from './admin-ips.controller';
import { InternalTrafficService } from './internal-traffic.service';
import { AnalyticsSession } from '../analytics/analytics-session.entity';
import { AdminGuard } from '../../common/admin.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminIp, AnalyticsSession]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AdminIpsController],
  providers: [AdminIpsService, InternalTrafficService, AdminGuard],
  exports: [AdminIpsService],
})
export class AdminIpsModule {}
