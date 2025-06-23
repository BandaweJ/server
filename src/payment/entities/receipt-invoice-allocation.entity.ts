/* eslint-disable prettier/prettier */
// src/finance/entities/receipt-invoice-allocation.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { ReceiptEntity } from './payment.entity'; // Assuming your receipt entity is in payment.entity.ts
import { InvoiceEntity } from './invoice.entity';

@Entity('receipt_invoice_allocations')
export class ReceiptInvoiceAllocationEntity {
  @PrimaryGeneratedColumn()
  id: number;

  // Many-to-One relationship with ReceiptEntity
  // This column (receiptId) will be the foreign key in the database
  @ManyToOne(() => ReceiptEntity, (receipt) => receipt.allocations, {
    onDelete: 'CASCADE',
  }) // If a receipt is deleted, its allocations are too
  @JoinColumn({ name: 'receiptId' }) // The actual column name for the FK
  receipt: ReceiptEntity;

  // Many-to-One relationship with InvoiceEntity
  // This column (invoiceId) will be the foreign key in the database
  @ManyToOne(() => InvoiceEntity, (invoice) => invoice.allocations, {
    onDelete: 'RESTRICT',
  }) // Usually RESTRICT for financial data
  @JoinColumn({ name: 'invoiceId' }) // The actual column name for the FK
  invoice: InvoiceEntity;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: 'Amount of this specific receipt applied to this specific invoice',
  })
  amountApplied: number;

  @CreateDateColumn({ type: 'timestamp' })
  allocationDate: Date; // Timestamp for when this allocation was made
}
