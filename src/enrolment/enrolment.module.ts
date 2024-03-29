import { Module } from '@nestjs/common';
import { EnrolmentController } from './enrolment.controller';
import { EnrolmentService } from './enrolment.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TermsEntity } from './entities/term.entity';
import { ClassEntity } from './entities/class.entity';
import { AuthModule } from '../auth/auth.module';
import { EnrolEntity } from './entities/enrol.entity';
import { ResourceByIdModule } from '../resource-by-id/resource-by-id.module';
import { AttendanceEntity } from './entities/attendance.entity';

@Module({
  imports: [
    AuthModule,
    ResourceByIdModule,
    TypeOrmModule.forFeature([
      TermsEntity,
      ClassEntity,
      EnrolEntity,
      AttendanceEntity,
    ]),
  ],
  controllers: [EnrolmentController],
  providers: [EnrolmentService],
  exports: [EnrolmentService],
})
export class EnrolmentModule {}