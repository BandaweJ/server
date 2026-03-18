import {
  BaseEntity,
  Column,
  Entity,
  OneToMany,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TeachersEntity } from './teachers.entity';
import { DepartmentSubjectEntity } from './department-subject.entity';

@Entity('departments')
export class DepartmentEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  hodId?: string | null;

  @ManyToOne(() => TeachersEntity, { nullable: true })
  @JoinColumn({ name: 'hodId' })
  hod?: TeachersEntity | null;

  @OneToMany(() => TeachersEntity, (teacher) => teacher.department)
  teachers: TeachersEntity[];

  @OneToMany(
    () => DepartmentSubjectEntity,
    (departmentSubject) => departmentSubject.department,
  )
  subjectMappings: DepartmentSubjectEntity[];
}

