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
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { InventoryItemEntity } from './inventory-item.entity';
import { InventoryAdjustmentReason } from '../models/inventory-adjustment-reason.enum';

@Entity('inventory_adjustments')
export class InventoryAdjustmentEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @Index()
  @Column()
  inventoryItemId: string;

  @ManyToOne(() => InventoryItemEntity, (item) => item.adjustments, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'inventoryItemId' })
  item: InventoryItemEntity;

  @Column({ type: 'integer' })
  delta: number;

  @Column({ type: 'enum', enum: InventoryAdjustmentReason })
  reason: InventoryAdjustmentReason;

  @Column({ nullable: true })
  reference?: string | null;

  @Column({ nullable: true })
  notes?: string | null;

  @Index()
  @Column()
  createdByTeacherId: string;

  @ManyToOne(() => TeachersEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'createdByTeacherId' })
  createdBy: TeachersEntity;
}

