/* eslint-disable prettier/prettier */
// src/finance/entities/student-credit.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  OneToMany, // ADD THIS IMPORT
} from 'typeorm';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { numberTransformer } from 'src/common/transformers/number.transformer'; // Assuming you have this
import { CreditInvoiceAllocationEntity } from './credit-invoice-allocation.entity'; // ADD THIS IMPORT

@Entity('student_credits')
export class StudentCreditEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => StudentsEntity, (student) => student.studentCredit)
  @JoinColumn({ name: 'studentId' }) // Foreign key for the student
  student: StudentsEntity;

  @Column({ unique: true }) // Ensure one credit entry per student
  studentNumber: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0.0,
    transformer: numberTransformer,
    comment: 'The current credit balance for the student.',
  })
  amount: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ nullable: true })
  lastCreditSource: string; // E.g., 'Overpayment from Receipt RCPT-XYZ', 'Refund from Course Cancellation'

  // NEW: One-to-many relationship with credit allocations
  @OneToMany(
    () => CreditInvoiceAllocationEntity, // ADD THIS LINE
    (allocation) => allocation.studentCredit, // ADD THIS LINE
  )
  creditAllocations: CreditInvoiceAllocationEntity[]; // ADD THIS LINE
}
