/* eslint-disable prettier/prettier */
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';
import { Residence } from 'src/enrolment/models/residence.model';
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
  residence: Residence;

  @OneToMany(() => EnrolEntity, (enrol) => enrol.fees)
  enrols: EnrolEntity;
}
