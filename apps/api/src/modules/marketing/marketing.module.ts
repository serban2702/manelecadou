import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketingCampaign, MarketingRule } from './marketing.entities';
import { EmailOptOut } from './email-opt-out.entity';
import { MarketingService } from './marketing.service';
import { MarketingCronService } from './marketing-cron.service';
import { AdminMarketingController, MarketingPublicController } from './marketing.controller';
import { User } from '../users/user.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { Payment } from '../payments/payment.entity';
import { PromoCode } from '../promo/promo-code.entity';
import { OutboundEmail } from '../outbound-email/outbound-email.entity';
import { AuthModule } from '../auth/auth.module';
import { PromoModule } from '../promo/promo.module';
import { SitesModule } from '../sites/sites.module';
import { SettingsModule } from '../settings/settings.module';
import { MailerModule } from '../../mailer/mailer.module';
import { AdminGuard } from '../../common/admin.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MarketingCampaign,
      MarketingRule,
      EmailOptOut,
      User,
      GuestSession,
      Payment,
      PromoCode,
      OutboundEmail,
    ]),
    AuthModule,
    PromoModule,
    SitesModule,
    SettingsModule,
    MailerModule,
  ],
  providers: [MarketingService, MarketingCronService, AdminGuard],
  controllers: [AdminMarketingController, MarketingPublicController],
  exports: [MarketingService],
})
export class MarketingModule {}
