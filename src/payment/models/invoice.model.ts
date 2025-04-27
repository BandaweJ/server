/* eslint-disable prettier/prettier */
import { BillsEntity } from 'src/finance/entities/bills.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { PaymentEntity } from '../entities/payment.entity';
import { BalancesEntity } from 'src/finance/entities/balances.entity';
import * as crypto from 'crypto';

/* eslint-disable prettier/prettier */
export class Invoice {
  constructor(
    public totalBill: number,
    public totalPayments: number,
    public balanceBfwd: BalancesEntity,
    public student: StudentsEntity,
    public bills: BillsEntity[],
    public payments: PaymentEntity[],
    public balance: number,
    public invoiceNumber?: string,
    public invoiceDate: Date = new Date(),
    public invoiceDueDate: Date = new Date(),
  ) {
    this.invoiceNumber = this.generateInvoiceNumber();
  }

  generateInvoiceNumber(): string {
    const timestamp = Date.now();
    const random = Math.random();
    const hash = crypto
      .createHash('md5')
      .update(`${timestamp}-${random}`)
      .digest('hex')
      .slice(0, 6)
      .toUpperCase();
    return `INV-${hash}`;
  }
}
