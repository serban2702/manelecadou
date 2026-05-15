import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminSunoController } from './admin-suno.controller';
import { AdminLyricsController } from './admin-lyrics.controller';
import { AdminGuard } from '../../common/admin.guard';
import { User } from '../users/user.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { Generation } from '../generations/generation.entity';
import { Payment } from '../payments/payment.entity';
import { SunoLog } from '../suno/suno-log.entity';
import { SunoCreditPurchase } from '../suno/suno-credit-purchase.entity';
import { LyricsLog } from '../lyrics/lyrics-log.entity';
import { AnalyticsSession } from '../analytics/analytics-session.entity';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { MailerModule } from '../../mailer/mailer.module';
import { SeederModule } from '../../database/seeder/seeder.module';
import { SunoModule } from '../suno/suno.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, GuestSession, Generation, Payment, SunoLog, SunoCreditPurchase, LyricsLog, AnalyticsSession]),
    AuthModule,
    MailerModule,
    SeederModule,
    SunoModule,
    PaymentsModule,
  ],
  controllers: [AdminController, AdminSunoController, AdminLyricsController],
  providers: [AdminGuard],
})
export class AdminModule {}
