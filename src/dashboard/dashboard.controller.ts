/* eslint-disable prettier/prettier */
import { Controller, Get, Param } from '@nestjs/common';
import { StudentDashboardSummary } from './models/student-dashboard-summary.model';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('student/:studentNumber')
  getStudentDashboardSummary(
    @Param('studentNumber') studentNumber: string,
  ): Promise<StudentDashboardSummary> {
    return this.dashboardService.getStudentDashboardSummary(studentNumber);
  }
}
