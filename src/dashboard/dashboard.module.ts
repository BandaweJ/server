import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ParentDashboardController } from './parent-dashboard.controller';
import { ParentDashboardService } from './parent-dashboard.service';
import { PaymentModule } from 'src/payment/payment.module';
import { ReportsModule } from 'src/reports/reports.module';
import { AuthModule } from 'src/auth/auth.module';
import { ProfilesModule } from 'src/profiles/profiles.module';
import { EnrolmentModule } from 'src/enrolment/enrolment.module';

@Module({
  controllers: [DashboardController, ParentDashboardController],
  providers: [DashboardService, ParentDashboardService],
  imports: [
    AuthModule,
    PaymentModule,
    ReportsModule,
    ProfilesModule,
    EnrolmentModule,
  ],
  exports: [DashboardService],
})
export class DashboardModule {}
