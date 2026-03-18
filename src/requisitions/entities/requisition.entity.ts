import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DepartmentEntity } from 'src/profiles/entities/department.entity';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { RequisitionStatus } from '../models/requisition-status.enum';
import { RequisitionItemEntity } from './requisition-item.entity';

@Entity('requisitions')
export class RequisitionEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column()
  title: string;

  @Column({ nullable: true })
  description?: string;

  @ManyToOne(() => DepartmentEntity, { nullable: false })
  department: DepartmentEntity;

  @ManyToOne(() => TeachersEntity, { nullable: false })
  createdBy: TeachersEntity;

  @Column({
    type: 'enum',
    enum: RequisitionStatus,
    default: RequisitionStatus.Submitted,
  })
  status: RequisitionStatus;

  @ManyToOne(() => TeachersEntity, { nullable: true })
  deputySignedBy?: TeachersEntity | null;

  @Column({ type: 'timestamp', nullable: true })
  deputySignedAt?: Date | null;

  @ManyToOne(() => TeachersEntity, { nullable: true })
  headSignedBy?: TeachersEntity | null;

  @Column({ type: 'timestamp', nullable: true })
  headSignedAt?: Date | null;

  @ManyToOne(() => TeachersEntity, { nullable: true })
  authorisedBy?: TeachersEntity | null;

  @Column({ type: 'timestamp', nullable: true })
  authorisedAt?: Date | null;

  @ManyToOne(() => TeachersEntity, { nullable: true })
  receivedBy?: TeachersEntity | null;

  @Column({ nullable: true })
  receivedById?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  receivedAt?: Date | null;

  @Column({ nullable: true })
  rejectionReason?: string | null;

  @OneToMany(() => RequisitionItemEntity, (item) => item.requisition, {
    cascade: true,
  })
  items: RequisitionItemEntity[];
}

