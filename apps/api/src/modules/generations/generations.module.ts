import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { Generation } from './generation.entity';
import { GenerationsService, GENERATIONS_QUEUE } from './generations.service';
import { GenerationsProcessor } from './generations.processor';
import { GenerationsController, PublicTopController } from './generations.controller';
import { AudioProcessorService } from './audio-processor.service';
import { SocialImageUploadService } from './social-image-upload.service';
import { SunoModule } from '../suno/suno.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { User } from '../users/user.entity';
import { MailerModule } from '../../mailer/mailer.module';
import { LyricsModule } from '../lyrics/lyrics.module';
import { GiftCodesModule } from '../gift-codes/gift-codes.module';
import { PromoModule } from '../promo/promo.module';
import { SitesModule } from '../sites/sites.module';
import { MediaModule } from '../media/media.module';
import { SiteDemosModule } from '../site-demos/site-demos.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Generation, GuestSession, User]),
    BullModule.registerQueue({ name: GENERATIONS_QUEUE }),
    SunoModule,
    AuthModule,
    forwardRef(() => PaymentsModule),
    MailerModule,
    LyricsModule,
    GiftCodesModule,
    PromoModule,
    SitesModule,
    MediaModule,
    SiteDemosModule,
  ],
  providers: [
    GenerationsService,
    GenerationsProcessor,
    AudioProcessorService,
    SocialImageUploadService,
  ],
  controllers: [GenerationsController, PublicTopController],
  exports: [GenerationsService],
})
export class GenerationsModule {}
