/* eslint-disable prettier/prettier */
import { numberTransformer } from 'src/common/transformers/number.transformer';
import { InvoiceEntity } from 'src/payment/entities/invoice.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('balances')
export class BalancesEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0.0,
    transformer: numberTransformer,
  })
  amount: number;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  dateCreated: Date;

  @Column()
  studentNumber: string;

  // One-to-One relationship with InvoiceEntity (inverse side)
  @OneToOne(() => InvoiceEntity, (invoice) => invoice.balanceBfwd)
  invoice: InvoiceEntity;
}
