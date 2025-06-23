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
import { InvoiceStatus } from 'src/finance/models/invoice-status.enum';
import { ReceiptInvoiceAllocationEntity } from './receipt-invoice-allocation.entity';

@Entity('invoice')
export class InvoiceEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
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
    comment:
      '(total of all the bills) The total amount the student is being billed for the invoice',
  })
  totalBill: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0.0 })
  amountPaidOnInvoice: number; // Tracks how much has been paid directly towards THIS invoice

  @Column({ default: InvoiceStatus.Pending })
  status: InvoiceStatus; // The current status of THIS invoice

  // @Column({ type: 'decimal', precision: 10, scale: 2 })
  // totalPayments: number;

  @ManyToOne(() => StudentsEntity, (student) => student.invoices)
  student: StudentsEntity;

  // One-to-One relationship with BalancesEntity

  @OneToOne(() => BalancesEntity, (balanceBfwd) => balanceBfwd.invoice)
  @JoinColumn({ name: 'balanceId' }) // Foreign key column in the invoices table
  balanceBfwd: BalancesEntity; //balance Bfwd if available (will eventually phase out)

  // One-to-One relationship with EnrolEntity
  @OneToOne(() => EnrolEntity, (enrol) => enrol.invoice)
  @JoinColumn({ name: 'enrolId' }) // Foreign key column in the invoices table
  enrol: EnrolEntity;

  @OneToMany(() => BillsEntity, (bill) => bill.invoice, {
    cascade: true, // Keep this if you want to save/update bills when saving/updating invoice
    onDelete: 'CASCADE', // THIS IS THE KEY ADDITION
  })
  bills: BillsEntity[];

  // NEW: One-to-many relationship with the allocation entity
  @OneToMany(
    () => ReceiptInvoiceAllocationEntity,
    (allocation) => allocation.invoice,
  )
  allocations: ReceiptInvoiceAllocationEntity[];

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
    if (
      this.amountPaidOnInvoice === undefined ||
      this.amountPaidOnInvoice === null
    ) {
      this.amountPaidOnInvoice = 0;
    }
    if (this.balance === undefined || this.balance === null) {
      // If totalBill is guaranteed to be set *before* saving, then this.balance = this.totalBill;
      // Otherwise, initialize to 0 and update balance/totalBill in your service logic.
      this.balance = 0; // Or better: this.totalBill - this.amountPaidOnInvoice; but totalBill might not be set yet.
    }
    if (!this.status) {
      // Initialize status for new invoices
      this.status = InvoiceStatus.Pending;
    }
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
