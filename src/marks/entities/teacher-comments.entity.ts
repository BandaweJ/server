import { IsOptional } from 'class-validator';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity('comments')
export class TeacherCommentEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  comment: string;

  @Column()
  name: string;

  @Column()
  num: number;

  @Column()
  year: number;

  @Column({ nullable: true })
  examType: string;

  @ManyToOne(() => TeachersEntity, (teacher) => teacher.comments, {
    nullable: false,
  })
  teacher: TeachersEntity;

  @ManyToOne(() => StudentsEntity, (student) => student.comments)
  student: StudentsEntity;
}
