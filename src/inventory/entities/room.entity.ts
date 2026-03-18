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
import { InventoryItemEntity } from './inventory-item.entity';

@Entity('rooms')
@Unique(['departmentId', 'name'])
export class RoomEntity extends BaseEntity {
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

  @Column()
  name: string;

  @Column({ nullable: true })
  code?: string | null;

  @Column({ nullable: true })
  description?: string | null;

  @Index()
  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => InventoryItemEntity, (item) => item.room)
  items: InventoryItemEntity[];
}

