import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MessageEntity } from './message.entity';

@Entity('message_attachments')
export class MessageAttachmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => MessageEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'messageId' })
  message: MessageEntity;

  @Column({ name: 'messageId' })
  messageId: string;

  @Column()
  fileName: string;

  @Column()
  fileType: string;

  @Column({ type: 'bigint' })
  fileSize: number;

  @Column()
  filePath: string;

  @Column()
  mimeType: string;

  @Column({ nullable: true })
  thumbnailPath: string;

  @CreateDateColumn()
  createdAt: Date;
}

