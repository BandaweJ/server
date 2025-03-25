/* eslint-disable prettier/prettier */
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

@Entity('fees')
export class FeesEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  amount: number;

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

  @OneToMany(() => EnrolEntity, (enrol) => enrol.fees)
  enrols: EnrolEntity;
}
