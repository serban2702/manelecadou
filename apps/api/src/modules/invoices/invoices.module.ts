import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from './invoice.entity';
import { Payment } from '../payments/payment.entity';
import { User } from '../users/user.entity';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { SmartbillClient } from './smartbill.client';
import { AuthModule } from '../auth/auth.module';
import { SitesModule } from '../sites/sites.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invoice, Payment, User]),
    AuthModule,
    SitesModule,
  ],
  providers: [InvoicesService, SmartbillClient],
  controllers: [InvoicesController],
  exports: [InvoicesService, TypeOrmModule],
})
export class InvoicesModule {}
