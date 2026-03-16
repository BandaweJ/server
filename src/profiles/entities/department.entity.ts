import {
  BaseEntity,
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TeachersEntity } from './teachers.entity';

@Entity('departments')
export class DepartmentEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true })
  description?: string;

  @OneToMany(() => TeachersEntity, (teacher) => teacher.department)
  teachers: TeachersEntity[];
}

