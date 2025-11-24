import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AccountsEntity } from 'src/auth/entities/accounts.entity';

@Entity('calendar_events')
export class CalendarEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'timestamp' })
  endDate: Date;

  @Column({ default: false })
  allDay: boolean;

  @Column({ nullable: true })
  location: string;

  @Column({ nullable: true })
  color: string; // Hex color for event display

  @Column({ default: true })
  isPublic: boolean; // If false, only admins can see it

  @ManyToOne(() => AccountsEntity, { nullable: false })
  @JoinColumn({ name: 'createdById' })
  createdBy: AccountsEntity;

  @Column({ name: 'createdById' })
  createdById: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

