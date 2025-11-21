/* eslint-disable prettier/prettier */
// src/finance/entities/receipt-invoice-allocation.entity.ts
import {
  Check,
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
@Check(`"amountApplied" > 0`)
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
    transformer: {
      to: (value: number) => {
        if (value === null || value === undefined || isNaN(value)) {
          return '0.00';
        }
        const numValue = typeof value === 'number' ? value : parseFloat(String(value));
        if (isNaN(numValue)) {
          return '0.00';
        }
        // Ensure value doesn't exceed precision
        if (numValue > 99999999.99) {
          throw new Error(`Amount ${numValue} exceeds maximum allowed value (99,999,999.99)`);
        }
        return numValue.toFixed(2);
      },
      from: (value: string | number) => {
        if (value === null || value === undefined) {
          return 0;
        }
        if (typeof value === 'string') {
          const parsed = parseFloat(value);
          return isNaN(parsed) ? 0 : parsed;
        }
        return value;
      },
    },
    comment: 'Amount of this specific receipt applied to this specific invoice. Must be greater than zero (enforced by database constraint)',
  })
  amountApplied: number;

  @CreateDateColumn({ type: 'timestamp' })
  allocationDate: Date; // Timestamp for when this allocation was made
}
