import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto } from './dtos/mark-attendance.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { TeachersEntity } from '../profiles/entities/teachers.entity';
import { StudentsEntity } from '../profiles/entities/students.entity';
import { ParentsEntity } from '../profiles/entities/parents.entity';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { HasPermissions } from '../auth/decorators/has-permissions.decorator';
import { PERMISSIONS } from '../auth/models/permissions.constants';

@Controller('attendance')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  @Get('class/:className/:termNum/:year')
  @HasPermissions(PERMISSIONS.ATTENDANCE.VIEW)
  getClassAttendance(
    @Param('className') className: string,
    @Param('termNum', ParseIntPipe) termNum: number,
    @Param('year', ParseIntPipe) year: number,
    @Query('date') date?: string,
  ) {
    return this.attendanceService.getClassAttendance(
      className,
      termNum,
      year,
      date,
    );
  }

  @Post('mark')
  @HasPermissions(PERMISSIONS.ATTENDANCE.MARK)
  markAttendance(
    @Body() markAttendanceDto: MarkAttendanceDto,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.attendanceService.markAttendance(markAttendanceDto, profile);
  }

  @Get('reports/:className/:termNum/:year')
  @HasPermissions(PERMISSIONS.ATTENDANCE.VIEW_REPORTS)
  getAttendanceReports(
    @Param('className') className: string,
    @Param('termNum', ParseIntPipe) termNum: number,
    @Param('year', ParseIntPipe) year: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.attendanceService.getAttendanceReports(
      className,
      termNum,
      year,
      startDate,
      endDate,
    );
  }

  @Get('student/:studentNumber/:termNum/:year')
  getStudentAttendance(
    @Param('studentNumber') studentNumber: string,
    @Param('termNum', ParseIntPipe) termNum: number,
    @Param('year', ParseIntPipe) year: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.attendanceService.getStudentAttendance(
      studentNumber,
      termNum,
      year,
      startDate,
      endDate,
    );
  }

  @Get('summary/:className/:termNum/:year')
  getAttendanceSummary(
    @Param('className') className: string,
    @Param('termNum', ParseIntPipe) termNum: number,
    @Param('year', ParseIntPipe) year: number,
  ) {
    return this.attendanceService.getAttendanceSummary(
      className,
      termNum,
      year,
    );
  }
}
