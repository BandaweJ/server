import { ProfilesModule } from './../profiles/profiles.module';
/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { FinancialValidationService } from './services/financial-validation.service';
import { CreditService } from './services/credit.service';
import { InvoiceService } from './services/invoice.service';
import { ReceiptService } from './services/receipt.service';
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
import { CreditTransactionEntity } from './entities/credit-transaction.entity';
import { FinancialAuditLogEntity } from './entities/financial-audit-log.entity';
import { AccountsEntity } from 'src/auth/entities/accounts.entity';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { AuditService } from './services/audit.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { SystemModule } from '../system/system.module';
import { forwardRef } from '@nestjs/common';

@Module({
  controllers: [PaymentController],
  providers: [
    PaymentService,
    FinancialValidationService,
    CreditService,
    InvoiceService,
    ReceiptService,
    AuditService,
    RolesGuard,
  ],
  exports: [PaymentService, CreditService, InvoiceService, ReceiptService, AuditService],
  imports: [
    AuthModule,
    ProfilesModule,
    EnrolmentModule,
    FinanceModule,
    TypeOrmModule.forFeature([
      ReceiptEntity,
      InvoiceEntity,
      ReceiptInvoiceAllocationEntity,
      StudentCreditEntity,
      CreditInvoiceAllocationEntity,
      ReceiptCreditEntity,
      CreditTransactionEntity,
      FinancialAuditLogEntity,
      AccountsEntity,
      TeachersEntity,
    ]),
    ResourceByIdModule,
    forwardRef(() => NotificationsModule),
    forwardRef(() => SystemModule),
  ],
})
export class PaymentModule {}
