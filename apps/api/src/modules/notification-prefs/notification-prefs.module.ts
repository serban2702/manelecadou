import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AdminNotificationPrefs } from './notification-prefs.entity';
import { NotificationPrefsService } from './notification-prefs.service';
import { NotificationPrefsController } from './notification-prefs.controller';
import { AdminGuard } from '../../common/admin.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminNotificationPrefs]),
    // AdminGuard cere JwtService; fără JwtModule aici, Nest nu poate rezolva
    // guard-ul din controller și aplicația nu pornește deloc.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [NotificationPrefsController],
  providers: [NotificationPrefsService, AdminGuard],
  exports: [NotificationPrefsService],
})
export class NotificationPrefsModule {}
