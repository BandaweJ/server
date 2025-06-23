/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { AuthModule } from '../auth/auth.module';
import { MarksModule } from 'src/marks/marks.module';
import { EnrolmentModule } from '../enrolment/enrolment.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsEntity } from './entities/report.entity';
import { TeacherCommentEntity } from 'src/marks/entities/teacher-comments.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReportsEntity, TeacherCommentEntity]),
    AuthModule,
    MarksModule,
    EnrolmentModule,
  ],
  providers: [ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}
