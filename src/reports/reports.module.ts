import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { AuthModule } from '../auth/auth.module';
import { MarksModule } from 'src/marks/marks.module';
import { EnrolmentModule } from '../enrolment/enrolment.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsEntity } from './entities/report.entity';
import { TeacherCommentEntity } from 'src/marks/entities/teacher-comments.entity';
import { SystemModule } from '../system/system.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ResourceByIdModule } from '../resource-by-id/resource-by-id.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReportsEntity, TeacherCommentEntity]),
    AuthModule,
    MarksModule,
    EnrolmentModule,
    SystemModule,
    NotificationsModule,
    ResourceByIdModule,
    PaymentModule,
  ],
  providers: [ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}
