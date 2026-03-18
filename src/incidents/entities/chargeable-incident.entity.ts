import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DepartmentEntity } from 'src/profiles/entities/department.entity';
import { RoomEntity } from 'src/inventory/entities/room.entity';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { InventoryItemEntity } from 'src/inventory/entities/inventory-item.entity';
import { TextbookCopyEntity } from 'src/library/entities/textbook-copy.entity';
import { IncidentStatus } from '../models/incident-status.enum';
import { IncidentType } from '../models/incident-type.enum';

@Entity('chargeable_incidents')
export class ChargeableIncidentEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Index()
  @Column({ type: 'enum', enum: IncidentType })
  type: IncidentType;

  @Index()
  @Column()
  departmentId: string;

  @ManyToOne(() => DepartmentEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'departmentId' })
  department: DepartmentEntity;

  @Index()
  @Column({ nullable: true })
  roomId?: string | null;

  @ManyToOne(() => RoomEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'roomId' })
  room?: RoomEntity | null;

  @Index()
  @Column()
  reportedByTeacherId: string;

  @ManyToOne(() => TeachersEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reportedByTeacherId' })
  reportedBy: TeachersEntity;

  @Index()
  @Column({ nullable: true })
  studentNumber?: string | null;

  @ManyToOne(() => StudentsEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentNumber', referencedColumnName: 'studentNumber' })
  student?: StudentsEntity | null;

  @Column()
  description: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  replacementCost: number;

  @Index()
  @Column({ type: 'enum', enum: IncidentStatus, default: IncidentStatus.Submitted })
  status: IncidentStatus;

  @Index()
  @Column({ nullable: true })
  textbookCopyId?: string | null;

  @ManyToOne(() => TextbookCopyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'textbookCopyId' })
  textbookCopy?: TextbookCopyEntity | null;

  @Index()
  @Column({ nullable: true })
  inventoryItemId?: string | null;

  @ManyToOne(() => InventoryItemEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'inventoryItemId' })
  inventoryItem?: InventoryItemEntity | null;

  // Approval chain
  @Column({ type: 'timestamp', nullable: true })
  hodConfirmedAt?: Date | null;

  @Column({ nullable: true })
  hodConfirmedById?: string | null;

  @ManyToOne(() => TeachersEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'hodConfirmedById' })
  hodConfirmedBy?: TeachersEntity | null;

  @Column({ type: 'timestamp', nullable: true })
  deputySignedAt?: Date | null;

  @Column({ nullable: true })
  deputySignedById?: string | null;

  @ManyToOne(() => TeachersEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'deputySignedById' })
  deputySignedBy?: TeachersEntity | null;

  @Column({ type: 'timestamp', nullable: true })
  headSignedAt?: Date | null;

  @Column({ nullable: true })
  headSignedById?: string | null;

  @ManyToOne(() => TeachersEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'headSignedById' })
  headSignedBy?: TeachersEntity | null;

  @Column({ type: 'timestamp', nullable: true })
  acceptedAt?: Date | null;

  @Column({ nullable: true })
  acceptedById?: string | null;

  @ManyToOne(() => TeachersEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'acceptedById' })
  acceptedBy?: TeachersEntity | null;

  @Column({ type: 'timestamp', nullable: true })
  rejectedAt?: Date | null;

  @Column({ nullable: true })
  rejectedById?: string | null;

  @ManyToOne(() => TeachersEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'rejectedById' })
  rejectedBy?: TeachersEntity | null;

  @Column({ nullable: true })
  rejectionReason?: string | null;
}

