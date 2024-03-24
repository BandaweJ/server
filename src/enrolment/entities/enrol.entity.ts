import {
  Column,
  Entity,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { StudentsEntity } from '../../profiles/entities/students.entity';

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

  @ManyToOne(() => StudentsEntity, (student) => student.enrols)
  student: StudentsEntity;
}
