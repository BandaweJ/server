/* eslint-disable prettier/prettier */
// payment.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  PrimaryColumn,
} from 'typeorm';
import { StudentsEntity } from '../../profiles/entities/students.entity';

@Entity('payments')
export class PaymentEntity {
  @PrimaryColumn({ type: 'bigint', generated: 'increment' }) // Use increment
  receiptNumber: number;

  @ManyToOne(() => StudentsEntity, (student) => student.payments)
  student: StudentsEntity;

  @Column({ nullable: true })
  receiptBookNumber: string;
  //   @ManyToOne(() => EnrolEntity, (enrol) => enrol.payments, { nullable: true })
  //   enrolment: EnrolEntity | null; // Optional, payments can be made outside of specific enrolments

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column()
  description: string;

  @CreateDateColumn({ type: 'timestamp' })
  paymentDate: Date;

  @Column({ default: false })
  approved: boolean;
}
