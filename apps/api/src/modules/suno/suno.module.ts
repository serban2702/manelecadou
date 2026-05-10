import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SunoProvider } from './suno.types';
import { SunoMockProvider } from './providers/suno.mock.provider';
import { SunoRealProvider } from './providers/suno.real.provider';
import { SunoController } from './suno.controller';
import { SunoLog } from './suno-log.entity';
import { SunoCreditPurchase } from './suno-credit-purchase.entity';
import { SunoLogService } from './suno-log.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([SunoLog, SunoCreditPurchase])],
  controllers: [SunoController],
  providers: [
    SunoLogService,
    SunoMockProvider,
    SunoRealProvider,
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
