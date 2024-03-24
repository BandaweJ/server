import { type } from 'os';
import { AccountsEntity } from 'src/auth/entities/accounts.entity';
import { TeacherCommentEntity } from 'src/marks/entities/teacher-comments.entity';
import {
  Column,
  Entity,
  PrimaryColumn,
  BaseEntity,
  OneToOne,
  JoinColumn,
  Timestamp,
  OneToMany,
} from 'typeorm';

@Entity('teachers')
export class TeachersEntity extends BaseEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column()
  surname: string;

  @Column({ default: Timestamp })
  dob: Date;

  @Column()
  gender: string;

  @Column()
  title: string;

  @Column({ default: Timestamp })
  dateOfJoining: Date;

  @Column({ type: 'simple-array' })
  qualifications: string[];

  @Column({ default: true })
  actve: boolean;

  @Column()
  cell: string;

  @Column()
  email: string;

  @Column()
  address: string;

  @Column({ default: Timestamp })
  dateOfLeaving: Date;

  @Column({ default: 'teacher' })
  role: string;

  @OneToOne(() => AccountsEntity, (account) => account.teacher)
  account: AccountsEntity;

  @OneToMany(() => TeacherCommentEntity, (comments) => comments.teacher)
  comments: TeacherCommentEntity[];
}
