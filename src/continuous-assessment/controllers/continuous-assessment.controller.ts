import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Param,
  Query,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ContinuousAssessmentService } from '../services/continuous-assessment.service';
import { CreateContinuousAssessmentDto } from '../dtos/create-continuous-assessment.dto';
import { ROLES } from 'src/auth/models/roles.enum';

@Controller('continuous-assessment')
@UseGuards(JwtAuthGuard)
export class ContinuousAssessmentController {
  constructor(private readonly caService: ContinuousAssessmentService) {}

  @Post()
  async createAssessment(@Body() dto: CreateContinuousAssessmentDto, @Req() req: any) {
    return this.caService.createAssessment(dto, req.user);
  }

  @Get('class/:classId')
  async getClassAssessments(
    @Param('classId') classId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('subjectCode') subjectCode?: string,
    @Query('assessmentType') assessmentType?: string,
  ) {
    return this.caService.getClassAssessments(parseInt(classId, 10), {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      subjectCode,
      assessmentType,
    });
  }

  @Get('class/:classId/roster')
  async getClassRoster(
    @Param('classId') classId: string,
    @Query('assessmentDate') assessmentDate?: string,
    @Query('topic') topic?: string,
    @Query('subjectCode') subjectCode?: string,
    @Query('assessmentType') assessmentType?: string,
  ) {
    if (!assessmentDate || !topic) {
      throw new BadRequestException('assessmentDate and topic are required');
    }

    return this.caService.getClassRoster(
      parseInt(classId, 10),
      new Date(assessmentDate),
      topic,
      subjectCode,
      assessmentType,
    );
  }

  @Get('student/:studentId')
  async getStudentAssessments(
    @Param('studentId') studentId: string,
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('subjectCode') subjectCode?: string,
    @Query('assessmentType') assessmentType?: string,
  ) {
    this.ensureStudentAccess(req.user, studentId);
    return this.caService.getStudentAssessments(studentId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      subjectCode,
      assessmentType,
    });
  }

  @Get('student/:studentId/analytics')
  async getStudentAnalytics(@Param('studentId') studentId: string, @Req() req: any) {
    this.ensureStudentAccess(req.user, studentId);
    return this.caService.getStudentAnalytics(studentId);
  }

  private ensureStudentAccess(user: any, requestedStudentId: string) {
    if (!user?.role) {
      return;
    }

    if (user.role === ROLES.student && user.studentNumber !== requestedStudentId) {
      throw new ForbiddenException('You can only view your own assessments');
    }

    if (user.role === ROLES.parent) {
      const students = user.students || [];
      if (students.length > 0) {
        const hasAccess = students.some((student: any) => student.studentNumber === requestedStudentId);
        if (!hasAccess) {
          throw new ForbiddenException('You can only view your child assessments');
        }
      }
    }
  }
}

