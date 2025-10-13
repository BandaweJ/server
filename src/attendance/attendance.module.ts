import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceEntity } from './entities/attendance.entity';
import { StudentsEntity } from '../profiles/entities/students.entity';
import { EnrolEntity } from '../enrolment/entities/enrol.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceEntity,
      StudentsEntity,
      EnrolEntity,
    ]),
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
