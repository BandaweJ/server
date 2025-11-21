/* eslint-disable prettier/prettier */
// src/payment/entities/credit-transaction.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { StudentCreditEntity } from './student-credit.entity';
import { numberTransformer } from 'src/common/transformers/number.transformer';

export enum CreditTransactionType {
  CREDIT = 'CREDIT', // Credit created (e.g., from overpayment)
  DEDUCTION = 'DEDUCTION', // Credit deducted (legacy, use APPLICATION instead)
  APPLICATION = 'APPLICATION', // Credit applied to invoice
  REVERSAL = 'REVERSAL', // Credit reversed (e.g., from voided receipt)
}

@Entity('credit_transactions')
export class CreditTransactionEntity {
  @PrimaryGeneratedColumn()
  id: number;

  // Many-to-One relationship with StudentCreditEntity
  // This links the transaction to the student's credit balance
  @ManyToOne(
    () => StudentCreditEntity,
    (studentCredit) => studentCredit.transactions,
    {
      onDelete: 'RESTRICT', // Prevent deleting credit if transactions exist
      nullable: false,
    },
  )
  @JoinColumn({ name: 'studentCreditId' }) // Foreign key column
  studentCredit: StudentCreditEntity;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: numberTransformer,
    nullable: false,
    comment: 'Amount: Positive for credit/reversal, negative for deduction/application',
  })
  amount: number; // Positive for credit, negative for deduction/application

  @Column({
    type: 'enum',
    enum: CreditTransactionType,
    nullable: false,
    comment: 'Type of transaction: CREDIT, APPLICATION, or REVERSAL',
  })
  transactionType: CreditTransactionType;

  @Column({
    type: 'text',
    nullable: false,
    comment: 'Source description: e.g., "Overpayment from Receipt REC-123"',
  })
  source: string; // e.g., "Overpayment from Receipt REC-123"

  @Column({
    nullable: true,
    comment: 'ID of related receipt (if credit came from receipt)',
  })
  relatedReceiptId?: number;

  @Column({
    nullable: true,
    comment: 'ID of related invoice (if credit was applied to invoice)',
  })
  relatedInvoiceId?: number;

  @CreateDateColumn({ type: 'timestamp' })
  transactionDate: Date; // Timestamp for when this transaction occurred

  @Column({
    nullable: false,
    comment: 'Email or ID of the user who performed this transaction',
  })
  performedBy: string; // User email
}


