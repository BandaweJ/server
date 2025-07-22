/* eslint-disable prettier/prettier */
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ExemptionType } from '../enums/exemptions-type.enum';
import { InvoiceEntity } from 'src/payment/entities/invoice.entity';

@Entity('exemptions')
export class ExemptionEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => StudentsEntity, (student) => student.exemption)
  @JoinColumn({ name: 'studentId' })
  student: StudentsEntity;

  @OneToMany(() => InvoiceEntity, (invoice) => invoice.exemption, {
    cascade: false, // Don't cascade saves from exemption to invoice typically
    onDelete: 'NO ACTION', // Or 'RESTRICT' - if the exemption is deleted, what happens to the invoice's exemption field?
    // 'SET NULL' is safer if invoices should remain even if the exemption is removed.
    eager: false, // Don't load invoices automatically when fetching an exemption
  })
  invoices: InvoiceEntity[];

  @Column({
    type: 'enum',
    enum: ExemptionType,
    default: ExemptionType.FIXED_AMOUNT,
  })
  type: ExemptionType;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment:
      'The fixed amount of the exemption, if type is FIXED_AMOUNT or STAFF_SIBLING.',
  })
  fixedAmount: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    comment:
      'The percentage of the total bill to be exempted, if type is PERCENTAGE.',
  })
  percentageAmount: number;

  @Column({ nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
