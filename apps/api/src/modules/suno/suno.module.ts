import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from '../../common/admin.guard';
import { SunoProvider } from './suno.types';
import { SunoMockProvider } from './providers/suno.mock.provider';
import { SunoRealProvider } from './providers/suno.real.provider';
import { SunoController } from './suno.controller';
import { SunoCreditsController } from './suno-credits.controller';
import { SunoLog } from './suno-log.entity';
import { SunoCreditPurchase } from './suno-credit-purchase.entity';
import { SunoCreditMonitorState } from './suno-credit-monitor.entity';
import { SunoLogService } from './suno-log.service';
import { WingoNotifyService } from './wingo-notify.service';
import { SunoCreditMonitorService } from './suno-credit-monitor.service';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    TypeOrmModule.forFeature([SunoLog, SunoCreditPurchase, SunoCreditMonitorState]),
  ],
  controllers: [SunoController, SunoCreditsController],
  providers: [
    SunoLogService,
    SunoMockProvider,
    SunoRealProvider,
    WingoNotifyService,
    SunoCreditMonitorService,
    AdminGuard,
    {
      provide: SunoProvider,
      inject: [ConfigService, SunoMockProvider, SunoRealProvider],
      useFactory: (
        config: ConfigService,
        mock: SunoMockProvider,
        real: SunoRealProvider,
      ): SunoProvider => {
        const which = config.get<string>('SUNO_PROVIDER') ?? 'mock';
        return which === 'real' ? real : mock;
      },
    },
  ],
  exports: [SunoProvider, SunoLogService],
})
export class SunoModule {}
