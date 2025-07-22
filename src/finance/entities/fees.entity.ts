/* eslint-disable prettier/prettier */
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';
import { Residence } from 'src/enrolment/models/residence.model';
import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BillsEntity } from './bills.entity';
import { FeesNames } from '../models/fees-names.enum';
import { numberTransformer } from 'src/common/transformers/number.transformer';
import { ExemptionType } from 'src/exemptions/enums/exemptions-type.enum';

@Entity('fees')
export class FeesEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0.0,
  })
  amount: number;

  @Column()
  description: string;

  @Column({ type: 'enum', enum: FeesNames })
  name: FeesNames;

  @OneToMany(() => BillsEntity, (bill) => bill.fees)
  bills: BillsEntity[];

  exemptionType?: ExemptionType; // Added for displaying exemption type
}
