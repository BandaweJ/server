/* eslint-disable prettier/prettier */
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';
import { BalancesEntity } from 'src/finance/entities/balances.entity';
import { BillsEntity } from 'src/finance/entities/bills.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PaymentEntity } from './payment.entity';

@Entity('invoice')
export class InvoiceEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  invoiceNumber: string;

  @CreateDateColumn({ type: 'timestamp' })
  invoiceDate: Date;

  @Column()
  invoiceDueDate: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  balance: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalBill: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalPayments: number;

  @ManyToOne(() => StudentsEntity, (student) => student.invoices)
  student: StudentsEntity;

  // One-to-One relationship with BalancesEntity
  @OneToOne(() => BalancesEntity, (balanceBfwd) => balanceBfwd.invoice)
  @JoinColumn({ name: 'balanceId' }) // Foreign key column in the invoices table
  balanceBfwd: BalancesEntity;

  // One-to-One relationship with EnrolEntity
  @OneToOne(() => EnrolEntity, (enrol) => enrol.invoice)
  @JoinColumn({ name: 'enrolId' }) // Foreign key column in the invoices table
  enrol: EnrolEntity;

  @OneToMany(() => BillsEntity, (bill) => bill.invoice)
  bills: BillsEntity[];
}
