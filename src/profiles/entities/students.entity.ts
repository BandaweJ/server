/* eslint-disable prettier/prettier */
import {
  Column,
  Entity,
  ManyToOne,
  PrimaryColumn,
  BaseEntity,
  OneToMany,
  OneToOne,
  JoinColumn,
  Timestamp,
} from 'typeorm';
import { ParentsEntity } from './parents.entity';
import { EnrolEntity } from '../../enrolment/entities/enrol.entity';
import { MarksEntity } from '../../marks/entities/marks.entity';
import { AccountsEntity } from 'src/auth/entities/accounts.entity';
import { AttendanceEntity } from 'src/enrolment/entities/attendance.entity';
import { TeacherCommentEntity } from 'src/marks/entities/teacher-comments.entity';
import { PaymentEntity } from 'src/payment/entities/payment.entity';

@Entity('students')
export class StudentsEntity extends BaseEntity {
  @PrimaryColumn()
  studentNumber: string;

  @Column()
  name: string;

  @Column()
  surname: string;

  @Column({ default: Timestamp })
  dob: Date;

  @Column()
  gender: string;

  @Column({ nullable: true })
  idnumber: string;

  @Column({ default: Timestamp })
  dateOfJoining: Date;

  @Column({ default: '' })
  cell: string;

  @Column({ default: '' })
  email: string;

  @Column()
  address: string;

  @Column()
  prevSchool: string;

  @Column({ default: 'student' })
  role: string;

  // @Column({ default: 'Boarder' })
  // residence: 'Day' | 'Boarder';

  @ManyToOne(() => ParentsEntity, (parent) => parent.students)
  parent: ParentsEntity;

  @OneToMany(() => EnrolEntity, (enrol) => enrol.student, {
    cascade: true,
  })
  enrols: EnrolEntity[];

  @OneToMany(() => PaymentEntity, (enrol) => enrol.student)
  payments: PaymentEntity[];

  @OneToMany(() => AttendanceEntity, (attendance) => attendance.student, {
    cascade: true,
  })
  attendance: AttendanceEntity;

  @OneToMany(() => MarksEntity, (mark) => mark.student, { cascade: true })
  marks: MarksEntity[];

  @OneToOne(() => AccountsEntity, (account) => account.student, {
    cascade: true,
  })
  account: AccountsEntity;

  @OneToMany(() => TeacherCommentEntity, (comment) => comment.student)
  comments: TeacherCommentEntity[];
}
