import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { CustomThrottlerGuard } from './common/throttler';

import { configValidate } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { GuestSessionsModule } from './modules/guest-sessions/guest-sessions.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { GenerationsModule } from './modules/generations/generations.module';
import { SunoModule } from './modules/suno/suno.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { AdminModule } from './modules/admin/admin.module';
import { DatabaseAdminModule } from './modules/database-admin/database-admin.module';
import { ChatModule } from './modules/chat/chat.module';
import { PromoModule } from './modules/promo/promo.module';
import { GiftCodesModule } from './modules/gift-codes/gift-codes.module';
import { RouletteModule } from './modules/roulette/roulette.module';
import { ErrorsModule } from './modules/errors/errors.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { SuggestionsModule } from './modules/suggestions/suggestions.module';
import { SeederModule } from './database/seeder/seeder.module';
import { MailerModule } from './mailer/mailer.module';
import { MailModule } from './modules/mail/mail.module';
import { KbModule } from './modules/kb/kb.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SitesModule } from './modules/sites/sites.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: configValidate,
    }),
    ThrottlerModule.forRoot([
      { name: 'short',  ttl: 1_000,    limit: 10 },    // 10 req/secundă per IP
      { name: 'medium', ttl: 60_000,   limit: 60 },    // 60 req/minut per IP
      { name: 'long',   ttl: 86_400_000, limit: 1000 }, // 1000 req/zi per IP
    ]),
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          host: process.env.REDIS_HOST ?? 'redis',
          port: Number(process.env.REDIS_PORT ?? 6379),
        },
      }),
    }),
    DatabaseModule,
    SitesModule,
    MailerModule,
    HealthModule,
    GuestSessionsModule,
    UsersModule,
    AuthModule,
    SunoModule,
    GenerationsModule,
    PaymentsModule,
    AdminModule,
    DatabaseAdminModule,
    ChatModule,
    PromoModule,
    GiftCodesModule,
    RouletteModule,
    ErrorsModule,
    AnalyticsModule,
    SuggestionsModule,
    SettingsModule,
    KbModule,
    MailModule,
    SeederModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: CustomThrottlerGuard },
  ],
})
export class AppModule {}
