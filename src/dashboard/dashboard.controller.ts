/* eslint-disable prettier/prettier */
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { StudentDashboardSummary } from './models/student-dashboard-summary.model';
import { DashboardService } from './dashboard.service';
import { ParentStudentAccessGuard } from 'src/auth/guards/parent-student-access.guard';

@Controller('dashboard')
@UseGuards(AuthGuard(), ParentStudentAccessGuard)
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('student/:studentNumber')
  getStudentDashboardSummary(
    @Param('studentNumber') studentNumber: string,
  ): Promise<StudentDashboardSummary> {
    return this.dashboardService.getStudentDashboardSummary(studentNumber);
  }
}
