/* eslint-disable prettier/prettier */
import { forwardRef, Module } from '@nestjs/common';
import { EnrolmentController } from './enrolment.controller';
import { EnrolmentService } from './enrolment.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TermsEntity } from './entities/term.entity';
import { ClassEntity } from './entities/class.entity';
import { AuthModule } from '../auth/auth.module';
import { EnrolEntity } from './entities/enrol.entity';
import { ResourceByIdModule } from '../resource-by-id/resource-by-id.module';
import { AttendanceEntity } from '../attendance/entities/attendance.entity';
import { FinanceModule } from 'src/finance/finance.module';
import { ProfilesModule } from 'src/profiles/profiles.module';
import { FinanceService } from 'src/finance/finance.service';

@Module({
  imports: [
    AuthModule,
    ResourceByIdModule,
    ProfilesModule,
    // FinanceModule,
    forwardRef(() => FinanceModule),
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
