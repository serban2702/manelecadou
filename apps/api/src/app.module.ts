import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RequestLoggerMiddleware } from './common/request-logger.middleware';
import { OpenReplayMiddleware } from './common/openreplay.middleware';
import { OpenReplaySubscriber } from './common/openreplay.subscriber';
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
import { AiAssistantModule } from './modules/ai-assistant/ai-assistant.module';
import { TiktokModule } from './modules/tiktok/tiktok.module';
import { SeoPagesModule } from './modules/seo-pages/seo-pages.module';
import { WebPushModule } from './modules/web-push/web-push.module';
import { AiChatModule } from './modules/ai-chat/ai-chat.module';
import { OutboundEmailModule } from './modules/outbound-email/outbound-email.module';
import { MetaCapiModule } from './modules/meta-capi/meta-capi.module';
import { SiteDemosModule } from './modules/site-demos/site-demos.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { CollageModule } from './modules/collage/collage.module';

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
    OutboundEmailModule,
    MetaCapiModule,
    MailerModule,
    HealthModule,
    GuestSessionsModule,
    UsersModule,
    AuthModule,
    SunoModule,
    GenerationsModule,
    PaymentsModule,
    TiktokModule,
    SeoPagesModule,
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
    AiAssistantModule,
    WebPushModule,
    AiChatModule,
    SiteDemosModule,
    InvoicesModule,
    MarketingModule,
    CollageModule,
    SeederModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: CustomThrottlerGuard },
    OpenReplaySubscriber,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // OpenReplay middleware ÎNAINTE de request logger ca să propage
    // session-id-ul în AsyncLocalStorage pentru toate handlerele + DB writes.
    consumer.apply(OpenReplayMiddleware, RequestLoggerMiddleware).forRoutes('*');
  }
}
