import { ProfilesModule } from './../profiles/profiles.module';
/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { AuthModule } from 'src/auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReceiptEntity } from './entities/payment.entity';
import { EnrolmentModule } from 'src/enrolment/enrolment.module';
import { FinanceModule } from 'src/finance/finance.module';
import { ResourceByIdModule } from 'src/resource-by-id/resource-by-id.module';
import { InvoiceEntity } from './entities/invoice.entity';
import { ReceiptInvoiceAllocationEntity } from './entities/receipt-invoice-allocation.entity';
import { ExemptionEntity } from '../exemptions/entities/exemptions.entity';
import { StudentCreditEntity } from './entities/student-credit.entity';
import { CreditInvoiceAllocationEntity } from './entities/credit-invoice-allocation.entity';
import { ReceiptCreditEntity } from './entities/receipt-credit.entity';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
  imports: [
    AuthModule,
    ProfilesModule,
    EnrolmentModule,
    FinanceModule,
    ProfilesModule,
    TypeOrmModule.forFeature([
      ReceiptEntity,
      InvoiceEntity,
      ReceiptInvoiceAllocationEntity,
      StudentCreditEntity,
      CreditInvoiceAllocationEntity,
      ReceiptCreditEntity,
    ]),
    ResourceByIdModule,
  ],
})
export class PaymentModule {}
