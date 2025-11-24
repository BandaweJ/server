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
import { ConversationEntity } from './conversation.entity';
import { AccountsEntity } from 'src/auth/entities/accounts.entity';
import { MessageAttachmentEntity } from './message-attachment.entity';
import { MessageReadEntity } from './message-read.entity';

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  SYSTEM = 'system',
}

@Entity('messages')
export class MessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ConversationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: ConversationEntity;

  @Column({ name: 'conversationId' })
  conversationId: string;

  @ManyToOne(() => AccountsEntity, { nullable: true })
  @JoinColumn({ name: 'senderId' })
  sender: AccountsEntity;

  @Column({ name: 'senderId', nullable: true })
  senderId: string; // Nullable for system messages

  @Column({ type: 'text' })
  content: string;

  @Column({
    type: 'enum',
    enum: MessageType,
    default: MessageType.TEXT,
  })
  type: MessageType;

  @ManyToOne(() => MessageEntity, { nullable: true })
  @JoinColumn({ name: 'replyToId' })
  replyTo: MessageEntity;

  @Column({ name: 'replyToId', nullable: true })
  replyToId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  editedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  deletedAt: Date;

  @Column({ default: false })
  isPinned: boolean;

  @OneToMany(() => MessageAttachmentEntity, (attachment) => attachment.message)
  attachments: MessageAttachmentEntity[];

  @OneToMany(() => MessageReadEntity, (read) => read.message)
  reads: MessageReadEntity[];
}

