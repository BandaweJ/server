import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity('attendance')
export class AttendanceEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  num: number;

  @Column()
  year: number;

  @Column()
  present: boolean;

  @Column()
  date: Date;

  @ManyToOne(() => StudentsEntity, (student) => student.attendance)
  student: StudentsEntity;
}
