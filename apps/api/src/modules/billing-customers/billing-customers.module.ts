import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingCustomer } from './billing-customer.entity';
import { BillingCustomersService } from './billing-customers.service';
import { BillingCustomersController } from './billing-customers.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([BillingCustomer]), AuthModule],
  providers: [BillingCustomersService],
  controllers: [BillingCustomersController],
  exports: [BillingCustomersService, TypeOrmModule],
})
export class BillingCustomersModule {}
