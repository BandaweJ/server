/* eslint-disable prettier/prettier */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { AccountsEntity } from '../../auth/entities/accounts.entity';

@Entity('user_activities')
@Index(['userId', 'timestamp'])
@Index(['action', 'timestamp'])
export class ActivityEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => AccountsEntity, { nullable: true })
  user?: AccountsEntity;

  @Column({ length: 100 })
  action: string; // e.g., 'USER_UPDATED', 'LOGIN', 'PASSWORD_RESET'

  @Column('text')
  description: string;

  @Column({ nullable: true, length: 45 })
  ipAddress?: string;

  @Column({ nullable: true, type: 'text' })
  userAgent?: string;

  @Column({ nullable: true, length: 50 })
  resourceType?: string; // e.g., 'user', 'student', 'teacher'

  @Column({ nullable: true, length: 100 })
  resourceId?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>; // Additional context data

  @CreateDateColumn({ type: 'timestamp' })
  @Index()
  timestamp: Date;

  @Column({ default: true })
  active: boolean;
}

