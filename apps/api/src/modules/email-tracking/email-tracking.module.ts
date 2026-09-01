import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EmailLink } from './email-link.entity';
import { EmailLinkClick } from './email-link-click.entity';
import { EmailTrackingService } from './email-tracking.service';
import { EmailTrackingStatsService } from './email-tracking-stats.service';
import {
  EmailTrackingAdminController,
  EmailTrackingPublicController,
} from './email-tracking.controller';
import { AdminGuard } from '../../common/admin.guard';

/**
 * Urmărirea linkurilor din emailuri: cine a apăsat, când, de câte ori și dacă a
 * cumpărat după.
 *
 * NU importă nici AuthModule, nici SettingsModule: primul ar închide ciclul
 * MailerModule → EmailTrackingModule → AuthModule → MailerModule, al doilea e
 * `@Global()` și oricum disponibil. AdminGuard are nevoie doar de JwtService,
 * exact ca în OutboundEmailModule.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([EmailLink, EmailLinkClick]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '7d' },
      }),
    }),
  ],
  providers: [EmailTrackingService, EmailTrackingStatsService, AdminGuard],
  controllers: [EmailTrackingPublicController, EmailTrackingAdminController],
  exports: [EmailTrackingService, EmailTrackingStatsService],
})
export class EmailTrackingModule {}
