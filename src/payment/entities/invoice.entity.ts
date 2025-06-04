/* eslint-disable prettier/prettier */
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';
import { BalancesEntity } from 'src/finance/entities/balances.entity';
import { BillsEntity } from 'src/finance/entities/bills.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import * as crypto from 'crypto';
import { numberTransformer } from 'src/common/transformers/number.transformer';

@Entity('invoice')
export class InvoiceEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  invoiceNumber: string;

  @CreateDateColumn({ type: 'timestamp' })
  invoiceDate: Date;

  @Column()
  invoiceDueDate: Date;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  balance: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  totalBill: number;

  // @Column({ type: 'decimal', precision: 10, scale: 2 })
  // totalPayments: number;

  @ManyToOne(() => StudentsEntity, (student) => student.invoices)
  student: StudentsEntity;

  // One-to-One relationship with BalancesEntity
  @OneToOne(() => BalancesEntity, (balanceBfwd) => balanceBfwd.invoice)
  @JoinColumn({ name: 'balanceId' }) // Foreign key column in the invoices table
  balanceBfwd: BalancesEntity;

  // One-to-One relationship with EnrolEntity
  @OneToOne(() => EnrolEntity, (enrol) => enrol.invoice)
  @JoinColumn({ name: 'enrolId' }) // Foreign key column in the invoices table
  enrol: EnrolEntity;

  @OneToMany(() => BillsEntity, (bill) => bill.invoice, { cascade: true })
  bills: BillsEntity[];

  // Constructor to initialize fields
  constructor() {
    // Only initialize if not already set, e.g., when loading from DB
    if (!this.invoiceNumber) {
      this.invoiceNumber = this.generateInvoiceNumber();
    }
    if (!this.invoiceDueDate) {
      // Assuming a due date of 30 days from creation
      this.invoiceDueDate = this.calculateDueDate(30);
    }
    // invoiceDate is handled by @CreateDateColumn, so no need to set here
    // balance, totalBill, totalPayments should be calculated based on logic,
    // often after bills or payments are added, so not initialized here.
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
}
