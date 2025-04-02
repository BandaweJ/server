/* eslint-disable prettier/prettier */
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import {
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FeesEntity } from './fees.entity';
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';

@Entity('bills')
export class BillsEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @CreateDateColumn({ type: 'timestamp' })
  date: Date;

  @ManyToOne(() => StudentsEntity, (student) => student.bills)
  student: StudentsEntity;

  @ManyToOne(() => FeesEntity, (fees) => fees.bills)
  fees: FeesEntity;

  @ManyToOne(() => EnrolEntity, (enrol) => enrol.bills)
  enrol: EnrolEntity;
}
