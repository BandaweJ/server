/* eslint-disable prettier/prettier */
import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { ReportModel } from '../models/report.model';

@Entity('reports')
export class ReportsEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  num: number;

  @Column()
  year: number;

  @Column()
  name: string;

  @Column()
  studentNumber: string;

  @Column('simple-json')
  report: ReportModel;

  @Column({ nullable: true })
  examType: string;
}
