import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { SubjectsEntity } from 'src/marks/entities/subjects.entity';

@Entity('continuous_assessments')
export class ContinuousAssessmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => StudentsEntity, { nullable: false })
  @JoinColumn({ name: 'studentId' })
  student: StudentsEntity;

  @Column()
  studentId: string;

  @ManyToOne(() => TeachersEntity, { nullable: true })
  @JoinColumn({ name: 'teacherId' })
  teacher: TeachersEntity;

  @Column({ nullable: true })
  teacherId: string;

  @Column({ type: 'int' })
  classId: number;

  @ManyToOne(() => SubjectsEntity, { nullable: true })
  @JoinColumn({ name: 'subjectCode', referencedColumnName: 'code' })
  subject?: SubjectsEntity;

  @Column({ nullable: true })
  subjectCode?: string;

  @Column({ length: 255 })
  topicOrSkill: string;

  @Column({ type: 'timestamp' })
  assessmentDate: Date;

  @Column({ type: 'numeric', precision: 6, scale: 2 })
  score: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  maxScore?: number;

  @Column({ length: 100, default: 'exercise' })
  assessmentType: string;

  @Column({ nullable: true, length: 100 })
  cohort?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

