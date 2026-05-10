import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { MagicLink } from './magic-link.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { GuestSessionsModule } from '../guest-sessions/guest-sessions.module';
import { MailerModule } from '../../mailer/mailer.module';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../../common/jwt.guard';
import { SitesModule } from '../sites/sites.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MagicLink]),
    UsersModule,
    GuestSessionsModule,
    MailerModule,
    SitesModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '7d' },
      }),
    }),
  ],
  providers: [AuthService, JwtAuthGuard, OptionalJwtAuthGuard],
  controllers: [AuthController],
  exports: [AuthService, JwtAuthGuard, OptionalJwtAuthGuard, JwtModule],
})
export class AuthModule {}
