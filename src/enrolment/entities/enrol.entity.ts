/* eslint-disable prettier/prettier */
import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { StudentsEntity } from '../../profiles/entities/students.entity';
import { Residence } from '../models/residence.model';
import { BillsEntity } from 'src/finance/entities/bills.entity';
import { InvoiceEntity } from 'src/payment/entities/invoice.entity';
import { ReceiptEntity } from 'src/payment/entities/payment.entity';

@Entity('enrol')
export class EnrolEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ comment: 'The name if the class' })
  name: string;

  @Column()
  num: number;

  @Column()
  year: number;

  @Column({ default: 'Boarder' })
  residence: Residence;

  @ManyToOne(() => StudentsEntity, (student) => student.enrols)
  student: StudentsEntity;

  @OneToMany(() => BillsEntity, (bill) => bill.enrol)
  bills: BillsEntity[];

  // One-to-One relationship with InvoiceEntity (inverse side)
  @OneToOne(() => InvoiceEntity, (invoice) => invoice.enrol)
  invoice: InvoiceEntity;

  @OneToMany(() => ReceiptEntity, (receipt) => receipt.enrol)
  receipts: ReceiptEntity[];
}
