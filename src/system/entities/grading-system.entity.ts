/* eslint-disable prettier/prettier */
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('grading_systems')
export class GradingSystemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  level: string; // 'O Level' or 'A Level'

  @Column('json')
  gradeThresholds: {
    aStar: number; // A* threshold
    a: number;     // A threshold
    b: number;     // B threshold
    c: number;     // C threshold
    d: number;     // D threshold
    e: number;     // E threshold
  };

  @Column({ nullable: true })
  failGrade: string; // 'F' for A Level, 'U' for O Level

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

