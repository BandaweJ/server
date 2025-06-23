/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PaymentModule } from 'src/payment/payment.module';
import { ReportsModule } from 'src/reports/reports.module';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
  imports: [PaymentModule, ReportsModule],
})
export class DashboardModule {}
