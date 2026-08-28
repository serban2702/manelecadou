import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminGuard } from '../../common/admin.guard';
import { AuthModule } from '../auth/auth.module';
import { LyricsModule } from '../lyrics/lyrics.module';
import { LyriaModule } from '../lyria/lyria.module';
import { SitesModule } from '../sites/sites.module';
import { SunoModule } from '../suno/suno.module';
import { PlaygroundRun } from './playground-run.entity';
import { PLAYGROUND_QUEUE } from './playground.constants';
import { PlaygroundController } from './playground.controller';
import { PlaygroundProcessor } from './playground.processor';
import { PlaygroundService } from './playground.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlaygroundRun]),
    BullModule.registerQueue({ name: PLAYGROUND_QUEUE }),
    AuthModule,
    SitesModule,
    LyricsModule,
    SunoModule,
    LyriaModule,
  ],
  controllers: [PlaygroundController],
  providers: [PlaygroundService, PlaygroundProcessor, AdminGuard],
})
export class PlaygroundModule {}
