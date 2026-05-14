import { Module } from '@nestjs/common';
import { TiktokEventsService } from './tiktok-events.service';

@Module({
  providers: [TiktokEventsService],
  exports: [TiktokEventsService],
})
export class TiktokModule {}
