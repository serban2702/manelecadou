import { Module } from '@nestjs/common';
import { TiktokEventsService } from './tiktok-events.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [TiktokEventsService],
  exports: [TiktokEventsService],
})
export class TiktokModule {}
