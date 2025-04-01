/* eslint-disable prettier/prettier */
import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { StudentsEntity } from '../../profiles/entities/students.entity';
import { FeesEntity } from 'src/finance/entities/fees.entity';
import { Residence } from '../models/residence.model';
import { BillsEntity } from 'src/finance/entities/bills.entity';

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
}
