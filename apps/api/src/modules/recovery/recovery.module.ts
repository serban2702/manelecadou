import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecoveryState } from './recovery-state.entity';
import { RecoveryService } from './recovery.service';
import { RecoveryCronService } from './recovery-cron.service';
import { RecoveryController } from './recovery.controller';
import { Payment } from '../payments/payment.entity';
import { Generation } from '../generations/generation.entity';
import { PromoCode } from '../promo/promo-code.entity';
import { PromoModule } from '../promo/promo.module';
import { SitesModule } from '../sites/sites.module';
import { SettingsModule } from '../settings/settings.module';
import { MailerModule } from '../../mailer/mailer.module';

/**
 * Recovery emails — recuperarea clienților care au abandonat plata.
 * Cron la 10 min: scanează payments failed (session_expired) + generări 'full'
 * pending neplătite, apoi trimite programul escaladat de emailuri cu coduri
 * promo personale (10% → 20% → 30%). Vezi `recovery.service.ts`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([RecoveryState, Payment, Generation, PromoCode]),
    PromoModule,
    SitesModule,
    SettingsModule,
    MailerModule,
  ],
  providers: [RecoveryService, RecoveryCronService],
  controllers: [RecoveryController],
  exports: [RecoveryService],
})
export class RecoveryModule {}
