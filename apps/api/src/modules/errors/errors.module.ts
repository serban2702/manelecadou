import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ErrorLog } from './error-log.entity';
import { ErrorsService } from './errors.service';
import { ErrorsController, AdminErrorsController } from './errors.controller';
import { GlobalErrorsFilter } from './errors-filter';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from '../../common/admin.guard';

@Module({
  imports: [TypeOrmModule.forFeature([ErrorLog]), AuthModule],
  providers: [
    ErrorsService,
    AdminGuard,
    { provide: APP_FILTER, useClass: GlobalErrorsFilter },
  ],
  controllers: [ErrorsController, AdminErrorsController],
  exports: [ErrorsService],
})
export class ErrorsModule {}
