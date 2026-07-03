import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from './invoice.entity';
import { Payment } from '../payments/payment.entity';
import { User } from '../users/user.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { BillingCustomer } from '../billing-customers/billing-customer.entity';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { SmartbillClient } from './smartbill.client';
import { AuthModule } from '../auth/auth.module';
import { SitesModule } from '../sites/sites.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invoice, Payment, User, GuestSession, BillingCustomer]),
    AuthModule,
    SitesModule,
    PaymentsModule,
  ],
  providers: [InvoicesService, SmartbillClient],
  controllers: [InvoicesController],
  exports: [InvoicesService, TypeOrmModule],
})
export class InvoicesModule {}
