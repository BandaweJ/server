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
import { ConversationEntity } from './conversation.entity';
import { AccountsEntity } from 'src/auth/entities/accounts.entity';

export enum ParticipantRole {
  ADMIN = 'admin',
  MEMBER = 'member',
}

@Entity('conversation_participants')
@Unique(['conversationId', 'userId'])
export class ConversationParticipantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ConversationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: ConversationEntity;

  @Column({ name: 'conversationId' })
  conversationId: string;

  @ManyToOne(() => AccountsEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: AccountsEntity;

  @Column({ name: 'userId' })
  userId: string;

  @Column({
    type: 'enum',
    enum: ParticipantRole,
    default: ParticipantRole.MEMBER,
  })
  role: ParticipantRole;

  @CreateDateColumn()
  joinedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  leftAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastReadAt: Date;

  @Column({ default: false })
  isMuted: boolean;

  @Column({ default: false })
  isArchived: boolean;
}

