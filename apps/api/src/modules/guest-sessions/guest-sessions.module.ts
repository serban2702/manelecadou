import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GuestSession } from './guest-session.entity';
import { GuestSessionsService } from './guest-sessions.service';
import { GuestSessionsController } from './guest-sessions.controller';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [TypeOrmModule.forFeature([GuestSession]), forwardRef(() => IdentityModule)],
  providers: [GuestSessionsService],
  controllers: [GuestSessionsController],
  exports: [GuestSessionsService, TypeOrmModule],
})
export class GuestSessionsModule {}
