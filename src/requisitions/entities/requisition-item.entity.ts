import {
  BaseEntity,
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RequisitionEntity } from './requisition.entity';

@Entity('requisition_items')
export class RequisitionItemEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => RequisitionEntity, (req) => req.items, {
    onDelete: 'CASCADE',
  })
  requisition: RequisitionEntity;

  @Column()
  description: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 1 })
  quantity: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  receivedQuantity: number;

  @Column({ nullable: true })
  intendedUse?: string;
}

