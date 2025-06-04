/* eslint-disable prettier/prettier */
// payment.entity.ts
import {
  Entity,
  Column,
  ManyToOne,
  CreateDateColumn,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { StudentsEntity } from '../../profiles/entities/students.entity';
import { PaymentMethods } from 'src/finance/models/payment-methods.model';
import { numberTransformer } from 'src/common/transformers/number.transformer';
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';

@Entity('receipts')
export class ReceiptEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column() // Use increment
  receiptNumber: string;

  @ManyToOne(() => StudentsEntity, (student) => student.receipts)
  student: StudentsEntity;

  @Column({ nullable: true })
  receiptBookNumber: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  amountPaid: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  amountDue: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
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

  @ManyToOne(() => EnrolEntity, (enrol) => enrol.receipts)
  enrol: EnrolEntity;
}
