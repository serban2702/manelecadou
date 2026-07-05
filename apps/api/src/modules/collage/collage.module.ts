import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { VideoCollage } from './video-collage.entity';
import { CollageService } from './collage.service';
import { CollageController } from './collage.controller';
import { AdminCollageController } from './admin-collage.controller';
import { CollageProcessor } from './collage.processor';
import { CollageUploadService } from './collage-upload.service';
import { COLLAGE_QUEUE } from './collage.constants';
import { Generation } from '../generations/generation.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { User } from '../users/user.entity';
import { AuthModule } from '../auth/auth.module';
import { SitesModule } from '../sites/sites.module';
import { MediaModule } from '../media/media.module';
import { MailerModule } from '../../mailer/mailer.module';
import { AdminGuard } from '../../common/admin.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([VideoCollage, Generation, GuestSession, User]),
    BullModule.registerQueue({ name: COLLAGE_QUEUE }),
    AuthModule,
    SitesModule,
    MediaModule,
    MailerModule,
  ],
  providers: [CollageService, CollageProcessor, CollageUploadService, AdminGuard],
  controllers: [CollageController, AdminCollageController],
  exports: [CollageService],
})
export class CollageModule {}
