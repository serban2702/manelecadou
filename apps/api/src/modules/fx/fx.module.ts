import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from '../../common/admin.guard';
import { FxRate } from './fx-rate.entity';
import { FxRateService } from './fx-rate.service';
import { FxAdminController } from './fx.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FxRate]), AuthModule],
  providers: [FxRateService, AdminGuard],
  controllers: [FxAdminController],
  exports: [FxRateService],
})
export class FxModule {}
