import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequisitionsController } from './requisitions.controller';
import { RequisitionsService } from './requisitions.service';
import { RequisitionEntity } from './entities/requisition.entity';
import { RequisitionItemEntity } from './entities/requisition-item.entity';
import { DepartmentEntity } from 'src/profiles/entities/department.entity';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RequisitionEntity,
      RequisitionItemEntity,
      DepartmentEntity,
      TeachersEntity,
    ]),
    AuthModule,
  ],
  controllers: [RequisitionsController],
  providers: [RequisitionsService],
})
export class RequisitionsModule {}

