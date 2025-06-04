/* eslint-disable prettier/prettier */
import { BillsEntity } from 'src/finance/entities/bills.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { BalancesEntity } from 'src/finance/entities/balances.entity';
import * as crypto from 'crypto';
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';

/* eslint-disable prettier/prettier */
export class Invoice {
  constructor(
    public totalBill: number,

    public balanceBfwd: BalancesEntity,
    public student: StudentsEntity,
    public bills: BillsEntity[],

    public balance: number,
    public enrol?: EnrolEntity,
    public invoiceNumber?: string,

    public invoiceDate: Date = new Date(),
    public invoiceDueDate?: Date,
    public id?: number,
  ) {
    this.invoiceNumber = this.generateInvoiceNumber();
    this.invoiceDueDate = this.calculateDueDate(30);
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

  private calculateDueDate(daysToAdd: number): Date {
    const currentDate = new Date();
    const futureDate = new Date(currentDate);
    futureDate.setDate(currentDate.getDate() + daysToAdd);
    return futureDate;
  }

  private calculateTotalBill(): number {
    return this.bills.reduce((total, bill) => total + bill.fees.amount, 0);
  }
}
