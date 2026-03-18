import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { DepartmentEntity } from 'src/profiles/entities/department.entity';
import { RoomEntity } from './room.entity';
import { InventoryAdjustmentEntity } from './inventory-adjustment.entity';

@Entity('inventory_items')
@Unique(['roomId', 'name'])
export class InventoryItemEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Index()
  @Column()
  departmentId: string;

  @ManyToOne(() => DepartmentEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'departmentId' })
  department: DepartmentEntity;

  @Index()
  @Column()
  roomId: string;

  @ManyToOne(() => RoomEntity, (room) => room.items, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'roomId' })
  room: RoomEntity;

  @Column()
  name: string;

  @Index()
  @Column({ nullable: true })
  category?: string | null;

  @Column({ nullable: true })
  unit?: string | null;

  @Column({ type: 'integer', default: 0 })
  quantityOnHand: number;

  @Column({ type: 'integer', nullable: true })
  reorderLevel?: number | null;

  @Column({ nullable: true })
  notes?: string | null;

  @Index()
  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => InventoryAdjustmentEntity, (adjustment) => adjustment.item)
  adjustments: InventoryAdjustmentEntity[];
}

