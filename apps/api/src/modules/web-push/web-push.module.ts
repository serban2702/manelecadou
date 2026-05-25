import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WebPushService } from './web-push.service';
import { WebPushController } from './web-push.controller';
import { WebPushSubscription } from './web-push-subscription.entity';
import { SettingsModule } from '../settings/settings.module';
import { AdminGuard } from '../../common/admin.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebPushSubscription]),
    SettingsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [WebPushService, AdminGuard],
  controllers: [WebPushController],
  exports: [WebPushService],
})
export class WebPushModule {}
