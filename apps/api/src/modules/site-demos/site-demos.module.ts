import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from '../../common/admin.guard';
import { SiteDemo } from './site-demo.entity';
import { SiteDemosService } from './site-demos.service';
import {
  AdminSiteDemosController,
  PublicSiteDemosController,
} from './site-demos.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SiteDemo]), AuthModule],
  providers: [SiteDemosService, AdminGuard],
  controllers: [AdminSiteDemosController, PublicSiteDemosController],
  exports: [SiteDemosService],
})
export class SiteDemosModule {}
