/* eslint-disable prettier/prettier */
// payment.entity.ts
import {
  Check,
  Entity,
  Column,
  ManyToOne,
  CreateDateColumn,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  OneToMany,
} from 'typeorm';
import { StudentsEntity } from '../../profiles/entities/students.entity';
import { PaymentMethods } from 'src/finance/models/payment-methods.model';
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';
import { ReceiptInvoiceAllocationEntity } from './receipt-invoice-allocation.entity';
import { ReceiptCreditEntity } from './receipt-credit.entity';

@Entity('receipts')
@Check(`"amountPaid" > 0`)
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
    comment: 'Amount paid must be greater than zero (enforced by database constraint)',
  })
  amountPaid: number;

  @Column()
  description: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  paymentDate: Date;

  @Column({ default: true })
  approved: boolean;

  @Column({ type: 'enum', enum: PaymentMethods })
  paymentMethod: PaymentMethods;

  @Column()
  servedBy: string;

  @ManyToOne(() => EnrolEntity, (enrol) => enrol.receipts)
  enrol: EnrolEntity;

  // NEW: One-to-many relationship with the allocation entity
  @OneToMany(
    () => ReceiptInvoiceAllocationEntity,
    (allocation) => allocation.receipt,
  )
  allocations: ReceiptInvoiceAllocationEntity[];

  // NEW: One-to-many relationship with receipt credits
  @OneToMany(
    () => ReceiptCreditEntity,
    (receiptCredit) => receiptCredit.receipt,
  )
  receiptCredits: ReceiptCreditEntity[];

  // NEW: Fields for voiding
  @Column({ default: false })
  isVoided: boolean;

  @Column({ type: 'timestamp', nullable: true })
  voidedAt: Date;

  @Column({ nullable: true })
  voidedBy: string; // E.g., email or ID of the user who voided it
}
