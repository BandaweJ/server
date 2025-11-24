import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { MessageEntity } from './message.entity';
import { AccountsEntity } from 'src/auth/entities/accounts.entity';

@Entity('message_reads')
@Unique(['messageId', 'userId'])
export class MessageReadEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => MessageEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'messageId' })
  message: MessageEntity;

  @Column({ name: 'messageId' })
  messageId: string;

  @ManyToOne(() => AccountsEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: AccountsEntity;

  @Column({ name: 'userId' })
  userId: string;

  @CreateDateColumn()
  readAt: Date;
}

