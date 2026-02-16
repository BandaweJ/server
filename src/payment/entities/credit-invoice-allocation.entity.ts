/* eslint-disable prettier/prettier */
// src/finance/entities/credit-invoice-allocation.entity.ts
import {
  Check,
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { StudentCreditEntity } from './student-credit.entity'; // Import the StudentCreditEntity
import { InvoiceEntity } from './invoice.entity'; // Import the InvoiceEntity
import { numberTransformer } from 'src/common/transformers/number.transformer';

@Entity('credit_invoice_allocations')
@Check(`"amountApplied" > 0`)
export class CreditInvoiceAllocationEntity {
  @PrimaryGeneratedColumn()
  id: number;

  // Many-to-One relationship with StudentCreditEntity
  // This links a specific credit application to the student's overall credit balance
  @ManyToOne(
    () => StudentCreditEntity,
    (studentCredit) => studentCredit.creditAllocations,
    {
      onDelete: 'RESTRICT', // Prevent deleting a credit balance if allocations exist
      nullable: false,
    },
  )
  @JoinColumn({ name: 'studentCreditId' }) // Foreign key column
  studentCredit: StudentCreditEntity;

  // Many-to-One relationship with InvoiceEntity
  // This links the credit application to the invoice it was applied to
  @ManyToOne(() => InvoiceEntity, (invoice) => invoice.creditAllocations, {
    onDelete: 'RESTRICT', // Usually RESTRICT for financial data
    nullable: false,
  })
  @JoinColumn({ name: 'invoiceId' }) // Foreign key column
  invoice: InvoiceEntity;

  /** Explicit FK so INSERT always has a value (TypeORM can leave relation FK null in some paths) */
  @Column({ name: 'invoiceId', insert: true, update: false, nullable: false })
  invoiceId: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: numberTransformer,
    nullable: false,
    comment: 'Amount of student credit applied to this specific invoice. Must be greater than zero (enforced by database constraint)',
  })
  amountApplied: number;

  @Column({
    nullable: true,
    comment: 'ID of the receipt that created the credit used in this allocation (for precise reversal on void)',
  })
  relatedReceiptId?: number;

  @CreateDateColumn({ type: 'timestamp' })
  allocationDate: Date; // Timestamp for when this credit was applied
}
