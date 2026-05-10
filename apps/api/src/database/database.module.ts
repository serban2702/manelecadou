import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

import { User } from '../modules/users/user.entity';
import { GuestSession } from '../modules/guest-sessions/guest-session.entity';
import { MagicLink } from '../modules/auth/magic-link.entity';
import { Generation } from '../modules/generations/generation.entity';
import { Payment } from '../modules/payments/payment.entity';
import { Conversation } from '../modules/chat/conversation.entity';
import { ChatMessage } from '../modules/chat/message.entity';
import { PromoCode, PromoRedemption } from '../modules/promo/promo-code.entity';
import { GiftCode } from '../modules/gift-codes/gift-code.entity';
import { RouletteSpin } from '../modules/roulette/roulette-spin.entity';
import { ErrorLog } from '../modules/errors/error-log.entity';
import { AnalyticsEvent } from '../modules/analytics/analytics-event.entity';
import { AnalyticsSession } from '../modules/analytics/analytics-session.entity';
import { SunoLog } from '../modules/suno/suno-log.entity';
import { SunoCreditPurchase } from '../modules/suno/suno-credit-purchase.entity';
import { Site } from '../modules/sites/site.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('POSTGRES_HOST'),
        port: config.get<number>('POSTGRES_PORT'),
        username: config.get<string>('POSTGRES_USER'),
        password: config.get<string>('POSTGRES_PASSWORD'),
        database: config.get<string>('POSTGRES_DB'),
        entities: [User, GuestSession, MagicLink, Generation, Payment, Conversation, ChatMessage, PromoCode, PromoRedemption, GiftCode, RouletteSpin, ErrorLog, AnalyticsEvent, AnalyticsSession, SunoLog, SunoCreditPurchase, Site],
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        autoLoadEntities: true,
        logging: ['error', 'warn'],
      }),
    }),
  ],
})
export class DatabaseModule {}
