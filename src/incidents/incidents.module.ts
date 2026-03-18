import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { EnrolmentModule } from 'src/enrolment/enrolment.module';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { RoomEntity } from 'src/inventory/entities/room.entity';
import { InventoryItemEntity } from 'src/inventory/entities/inventory-item.entity';
import { TextbookCopyEntity } from 'src/library/entities/textbook-copy.entity';
import { InvoiceChargeEntity } from 'src/payment/entities/invoice-charge.entity';
import { ChargeableIncidentEntity } from './entities/chargeable-incident.entity';
import { IncidentsService } from './incidents.service';
import { IncidentsController } from './incidents.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChargeableIncidentEntity,
      TeachersEntity,
      StudentsEntity,
      RoomEntity,
      InventoryItemEntity,
      TextbookCopyEntity,
      InvoiceChargeEntity,
    ]),
    AuthModule,
    EnrolmentModule,
  ],
  providers: [IncidentsService],
  controllers: [IncidentsController],
  exports: [IncidentsService],
})
export class IncidentsModule {}

