import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { TextbookCopyEntity } from './textbook-copy.entity';

@Entity('textbook_loans')
export class TextbookLoanEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @Index()
  @Column()
  copyId: string;

  @ManyToOne(() => TextbookCopyEntity, (copy) => copy.loans, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'copyId' })
  copy: TextbookCopyEntity;

  @Index()
  @Column()
  studentNumber: string;

  @ManyToOne(() => StudentsEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentNumber', referencedColumnName: 'studentNumber' })
  student: StudentsEntity;

  @Column({ type: 'timestamp' })
  borrowedAt: Date;

  @Column({ type: 'timestamp' })
  dueAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  returnedAt?: Date | null;

  @Index()
  @Column()
  issuedByTeacherId: string;

  @ManyToOne(() => TeachersEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'issuedByTeacherId' })
  issuedBy: TeachersEntity;

  @Index()
  @Column({ nullable: true })
  receivedByTeacherId?: string | null;

  @ManyToOne(() => TeachersEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'receivedByTeacherId' })
  receivedBy?: TeachersEntity | null;

  @Column({ nullable: true })
  notes?: string | null;
}

