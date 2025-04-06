/* eslint-disable prettier/prettier */
import { StudentsEntity } from 'src/profiles/entities/students.entity';
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

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0.0 })
  amount: number;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  dateCreated: Date;

  @Column()
  descrpition: string;

  @Column()
  studentNumber: string;
}
