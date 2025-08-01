/* eslint-disable prettier/prettier */
// src/finance/entities/credit-invoice-allocation.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { StudentCreditEntity } from './student-credit.entity'; // Import the StudentCreditEntity
import { InvoiceEntity } from './invoice.entity'; // Import the InvoiceEntity

@Entity('credit_invoice_allocations')
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
    },
  )
  @JoinColumn({ name: 'studentCreditId' }) // Foreign key column
  studentCredit: StudentCreditEntity;

  // Many-to-One relationship with InvoiceEntity
  // This links the credit application to the invoice it was applied to
  @ManyToOne(() => InvoiceEntity, (invoice) => invoice.creditAllocations, {
    onDelete: 'RESTRICT', // Usually RESTRICT for financial data
  })
  @JoinColumn({ name: 'invoiceId' }) // Foreign key column
  invoice: InvoiceEntity;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: 'Amount of student credit applied to this specific invoice',
  })
  amountApplied: number;

  @CreateDateColumn({ type: 'timestamp' })
  allocationDate: Date; // Timestamp for when this credit was applied
}
