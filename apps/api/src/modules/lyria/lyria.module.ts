import { Module } from '@nestjs/common';
import { LyriaService } from './lyria.service';

@Module({
  providers: [LyriaService],
  exports: [LyriaService],
})
export class LyriaModule {}
