import { BaseEntity, Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { StudentsEntity } from './students.entity';

@Entity('parents')
export class ParentsEntity extends BaseEntity {
  @PrimaryColumn()
  email: string;

  @Column()
  surname: string;

  @Column()
  sex: string;

  @Column()
  title: string;

  @Column()
  idnumber: string;

  @Column()
  cell: string;

  @Column()
  address: string;

  @Column({ default: 'parent' })
  role: string;

  @OneToMany(() => StudentsEntity, (student) => student.parent)
  students: StudentsEntity[];
}
