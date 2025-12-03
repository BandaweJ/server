/* eslint-disable prettier/prettier */
import {
  BaseEntity,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ROLES } from '../models/roles.enum';
import * as bcrypt from 'bcrypt';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { RoleEntity } from './role.entity';

@Entity('accounts')
@Unique(['username'])
export class AccountsEntity extends BaseEntity {
  @Column()
  role: ROLES; // Keep for backward compatibility

  @ManyToOne(() => RoleEntity, (roleEntity) => roleEntity.accounts, { nullable: true })
  @JoinColumn({ name: 'roleId' })
  roleEntity?: RoleEntity;

  @Column({ nullable: true })
  roleId?: string;

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
    // Use bcrypt.compare() instead of hashing again
    // bcrypt.compare() extracts the salt from the stored hash and compares correctly
    return await bcrypt.compare(password, this.password);
  }

  @OneToOne(() => StudentsEntity, (student) => student.account)
  @JoinColumn()
  student?: StudentsEntity;

  @OneToOne(() => TeachersEntity, (teacher) => teacher.account)
  @JoinColumn()
  teacher?: TeachersEntity;
}
