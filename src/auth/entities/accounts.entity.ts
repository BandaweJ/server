/* eslint-disable prettier/prettier */
import {
  BaseEntity,
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ROLES } from '../models/roles.enum';
import * as bcrypt from 'bcrypt';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';

@Entity('accounts')
@Unique(['username'])
export class AccountsEntity extends BaseEntity {
  @Column()
  role: ROLES;

  @Column()
  username: string;

  @Column()
  password: string;

  @Column()
  salt: string;

  @PrimaryColumn()
  id: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'timestamp', nullable: true })
  deletedAt?: Date;

  async validatePassword(password: string): Promise<boolean> {
    const hash = await bcrypt.hash(password, this.salt);
    return hash === this.password;
  }

  @OneToOne(() => StudentsEntity, (student) => student.account)
  @JoinColumn()
  student?: StudentsEntity;

  @OneToOne(() => TeachersEntity, (teacher) => teacher.account)
  @JoinColumn()
  teacher?: TeachersEntity;
}
