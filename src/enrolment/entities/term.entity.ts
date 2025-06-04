/* eslint-disable prettier/prettier */
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('terms')
export class TermsEntity {
  @PrimaryColumn()
  num: number;

  @PrimaryColumn()
  year: number;

  @Column()
  startDate: Date;

  @Column()
  endDate: Date;
}
