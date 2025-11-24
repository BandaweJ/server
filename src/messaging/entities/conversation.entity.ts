import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { AccountsEntity } from 'src/auth/entities/accounts.entity';
import { MessageEntity } from './message.entity';
import { ConversationParticipantEntity } from './conversation-participant.entity';

export enum ConversationType {
  DIRECT = 'direct',
  GROUP = 'group',
  CLASS = 'class',
  SCHOOL_WIDE = 'school_wide',
}

@Entity('conversations')
export class ConversationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ConversationType,
    default: ConversationType.DIRECT,
  })
  type: ConversationType;

  @Column({ nullable: true })
  name: string; // For groups, classes, school-wide

  @Column({ type: 'text', nullable: true })
  description: string;

  @ManyToOne(() => AccountsEntity, { nullable: false })
  @JoinColumn({ name: 'createdById' })
  createdBy: AccountsEntity;

  @Column({ name: 'createdById' })
  createdById: string;

  @Column({ type: 'int', nullable: true })
  classId: number; // For class-based conversations (FK to classes.id)

  @Column({ default: false })
  isArchived: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastMessageAt: Date;

  @OneToMany(() => MessageEntity, (message) => message.conversation)
  messages: MessageEntity[];

  @OneToMany(() => ConversationParticipantEntity, (participant) => participant.conversation)
  participants: ConversationParticipantEntity[];
}

