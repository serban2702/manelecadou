import { Module } from '@nestjs/common';
import { AdminExperiencesController } from './experiences.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AdminExperiencesController],
})
export class ExperiencesModule {}
