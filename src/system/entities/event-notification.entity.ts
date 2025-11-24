import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { CalendarEventEntity } from './calendar-event.entity';
import { AccountsEntity } from 'src/auth/entities/accounts.entity';

@Entity('event_notifications')
@Unique(['eventId', 'userId']) // One notification preference per user per event
export class EventNotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CalendarEventEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event: CalendarEventEntity;

  @Column()
  eventId: string;

  @ManyToOne(() => AccountsEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: AccountsEntity;

  @Column()
  userId: string;

  @Column({ default: true })
  enabled: boolean; // Whether notifications are enabled for this event

  @Column({ type: 'int', array: true, default: [] })
  reminderMinutes: number[]; // Array of minutes before event to send reminder (e.g., [1440, 60] = 1 day and 1 hour before)

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

