import {
  BaseEntity,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { DepartmentEntity } from './department.entity';
import { SubjectsEntity } from 'src/marks/entities/subjects.entity';

@Entity('department_subjects')
@Unique(['departmentId', 'subjectCode'])
export class DepartmentSubjectEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  departmentId: string;

  @ManyToOne(() => DepartmentEntity, (department) => department.subjectMappings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'departmentId' })
  department: DepartmentEntity;

  @Column()
  subjectCode: string;

  @ManyToOne(() => SubjectsEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subjectCode', referencedColumnName: 'code' })
  subject: SubjectsEntity;
}

