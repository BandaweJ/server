/* eslint-disable prettier/prettier */
// src/payment/entities/receipt-credit.entity.ts
import {
  Check,
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { ReceiptEntity } from './payment.entity';
import { StudentCreditEntity } from './student-credit.entity';
import { numberTransformer } from 'src/common/transformers/number.transformer';

@Entity('receipt_credits')
@Check(`"creditAmount" > 0`)
export class ReceiptCreditEntity {
  @PrimaryGeneratedColumn()
  id: number;

  // Many-to-One relationship with ReceiptEntity
  // This links the credit to the receipt that created it
  @ManyToOne(() => ReceiptEntity, {
    onDelete: 'RESTRICT', // Prevent deleting receipt if credit exists (void instead)
    nullable: false,
  })
  @JoinColumn({ name: 'receiptId' }) // Foreign key column
  receipt: ReceiptEntity;

  // Many-to-One relationship with StudentCreditEntity
  // This links to the student's credit balance
  @ManyToOne(
    () => StudentCreditEntity,
    (studentCredit) => studentCredit.receiptCredits,
    {
      onDelete: 'RESTRICT', // Prevent deleting credit if receipt credits exist
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
    comment: 'Amount of credit created from this receipt overpayment. Must be greater than zero (enforced by database constraint)',
  })
  creditAmount: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date; // Timestamp for when this credit was created
}

