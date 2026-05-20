import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GiftCode } from './gift-code.entity';
import { User } from '../users/user.entity';
import { GiftCodesService } from './gift-codes.service';
import { GiftCodesController, AdminGiftCodesController } from './gift-codes.controller';
import { AuthModule } from '../auth/auth.module';
import { MailerModule } from '../../mailer/mailer.module';
import { PaymentsModule } from '../payments/payments.module';
import { SitesModule } from '../sites/sites.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GiftCode, User]),
    AuthModule,
    MailerModule,
    SitesModule,
    forwardRef(() => PaymentsModule),
  ],
  providers: [GiftCodesService],
  controllers: [GiftCodesController, AdminGiftCodesController],
  exports: [GiftCodesService, TypeOrmModule],
})
export class GiftCodesModule {}
