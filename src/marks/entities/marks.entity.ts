import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SubjectsEntity } from './subjects.entity';
import { StudentsEntity } from '../../profiles/entities/students.entity';
import { timeStamp } from 'console';

@Entity('marks')
export class MarksEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  num: number;

  @Column()
  year: number;

  @Column()
  name: string;

  @Column()
  mark: number;

  @Column()
  comment: string;

  @Column({ type: 'timestamp', default: () => 'NOW()' })
  date: Date;

  @ManyToOne(() => SubjectsEntity, (subject) => subject.marks, {
    nullable: false,
  })
  @JoinColumn()
  subject: SubjectsEntity;

  @ManyToOne(() => StudentsEntity, (student) => student.marks, {
    nullable: false,
  })
  @JoinColumn()
  student: StudentsEntity;

  position?: string;
}