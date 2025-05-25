/* eslint-disable prettier/prettier */
// payment.entity.ts
import {
  Entity,
  Column,
  ManyToOne,
  CreateDateColumn,
  PrimaryColumn,
} from 'typeorm';
import { StudentsEntity } from '../../profiles/entities/students.entity';
import { PaymentMethods } from 'src/finance/models/payment-methods.model';

@Entity('receipts')
export class ReceiptEntity {
  @PrimaryColumn({ type: 'bigint', generated: 'increment' }) // Use increment
  receiptNumber: string;

  @ManyToOne(() => StudentsEntity, (student) => student.receipts)
  student: StudentsEntity;

  @Column({ nullable: true })
  receiptBookNumber: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amountPaid: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amountDue: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amountOutstanding: number;

  @Column()
  description: string;

  @CreateDateColumn({ type: 'timestamp' })
  paymentDate: Date;

  @Column({ default: false })
  approved: boolean;

  @Column({ type: 'enum', enum: PaymentMethods })
  paymentMethod: PaymentMethods;

  @Column()
  servedBy: string;
}
