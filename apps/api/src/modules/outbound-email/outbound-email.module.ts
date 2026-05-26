import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboundEmail } from './outbound-email.entity';
import { OutboundEmailService } from './outbound-email.service';
import { OutboundEmailController } from './outbound-email.controller';
import { AdminGuard } from '../../common/admin.guard';

/**
 * NU importăm AuthModule aici pentru a evita ciclu MailerModule → OutboundEmailModule
 * → AuthModule → MailerModule. AdminGuard are nevoie doar de JwtService, deci
 * înregistrăm direct JwtModule (cu același secret din config).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([OutboundEmail]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '7d' },
      }),
    }),
  ],
  providers: [OutboundEmailService, AdminGuard],
  controllers: [OutboundEmailController],
  exports: [OutboundEmailService],
})
export class OutboundEmailModule {}
