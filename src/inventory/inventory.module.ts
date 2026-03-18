import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { DepartmentEntity } from 'src/profiles/entities/department.entity';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { RoomEntity } from './entities/room.entity';
import { InventoryItemEntity } from './entities/inventory-item.entity';
import { InventoryAdjustmentEntity } from './entities/inventory-adjustment.entity';
import { RequisitionEntity } from 'src/requisitions/entities/requisition.entity';
import { RequisitionItemEntity } from 'src/requisitions/entities/requisition-item.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoomEntity,
      InventoryItemEntity,
      InventoryAdjustmentEntity,
      TeachersEntity,
      DepartmentEntity,
      RequisitionEntity,
      RequisitionItemEntity,
    ]),
    AuthModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}

