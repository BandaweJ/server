/* eslint-disable prettier/prettier */
import {
  Column,
  Entity,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { StudentsEntity } from '../../profiles/entities/students.entity';
import { FeesEntity } from 'src/finance/entities/fees.entity';

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

  @Column()
  residence:
    | 'Boarder'
    | 'Day'
    | 'DayTransport'
    | 'DayFood'
    | 'DayFoodTransport';

  @ManyToOne(() => StudentsEntity, (student) => student.enrols)
  student: StudentsEntity;

  @ManyToOne(() => FeesEntity, (fees) => fees.enrols)
  fees: FeesEntity;
}
