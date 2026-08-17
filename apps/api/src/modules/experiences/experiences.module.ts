import { Module } from '@nestjs/common';
import { AdminExperiencesController } from './experiences.controller';

@Module({
  controllers: [AdminExperiencesController],
})
export class ExperiencesModule {}
