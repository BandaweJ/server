import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';
import { InvoiceEntity } from './invoice.entity';
import { InvoiceChargeStatus } from '../models/invoice-charge-status.enum';

@Entity('invoice_charges')
export class InvoiceChargeEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @Index()
  @Column()
  studentNumber: string;

  @ManyToOne(() => StudentsEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentNumber', referencedColumnName: 'studentNumber' })
  student: StudentsEntity;

  @Index()
  @Column()
  enrolId: number;

  @ManyToOne(() => EnrolEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'enrolId' })
  enrol: EnrolEntity;

  @Index()
  @Column({ nullable: true })
  invoiceId?: number | null;

  @ManyToOne(() => InvoiceEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'invoiceId' })
  invoice?: InvoiceEntity | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: number;

  @Column()
  description: string;

  @Index()
  @Column({ nullable: true })
  sourceType?: string | null; // e.g. 'incident'

  @Index()
  @Column({ nullable: true })
  sourceId?: string | null; // e.g. incidentId

  @Index()
  @Column({ type: 'enum', enum: InvoiceChargeStatus, default: InvoiceChargeStatus.PendingInvoicing })
  status: InvoiceChargeStatus;

  @Column({ default: false })
  isVoided: boolean;
}

