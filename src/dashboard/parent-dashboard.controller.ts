import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { ParentsEntity } from 'src/profiles/entities/parents.entity';
import { ParentDashboardService } from './parent-dashboard.service';
import { ParentDashboardSummaryDto } from './dtos/parent-dashboard-summary.dto';

@Controller('parents')
@UseGuards(AuthGuard())
export class ParentDashboardController {
  constructor(
    private readonly parentDashboardService: ParentDashboardService,
  ) {}

  @Get('children/summary')
  getChildrenSummary(
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ): Promise<ParentDashboardSummaryDto> {
    return this.parentDashboardService.getChildrenSummary(profile);
  }
}
