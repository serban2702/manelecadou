import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GuestSession } from './guest-session.entity';
import { GuestSessionsService } from './guest-sessions.service';
import { GuestSessionsController } from './guest-sessions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([GuestSession])],
  providers: [GuestSessionsService],
  controllers: [GuestSessionsController],
  exports: [GuestSessionsService, TypeOrmModule],
})
export class GuestSessionsModule {}
