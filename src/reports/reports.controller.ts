import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { ParentsEntity } from 'src/profiles/entities/parents.entity';
import { HeadCommentDto } from './dtos/head-comment.dto';
import { TeacherCommentDto } from './dtos/teacher-comment.dto';
import { ReportsModel } from './models/reports.model';
import { ExamType } from 'src/marks/models/examtype.enum';
import { GenerateRoleCommentDto } from './dtos/generate-role-comment.dto';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { HasPermissions } from 'src/auth/decorators/has-permissions.decorator';
import { PERMISSIONS } from 'src/auth/models/permissions.constants';
import { ParentStudentAccessGuard } from 'src/auth/guards/parent-student-access.guard';
import { EnrolmentService } from 'src/enrolment/enrolment.service';

@Controller('reports')
@UseGuards(AuthGuard(), PermissionsGuard, ParentStudentAccessGuard)
export class ReportsController {
  constructor(
    private reportsService: ReportsService,
    private enrolmentService: EnrolmentService,
  ) {}

  @Get('/generate/:name/:termId/:examType')
  @HasPermissions(PERMISSIONS.REPORTS.GENERATE)
  generateReports(
    @Param('name') name: string,
    @Param('termId') termId: number,
    @GetUser() profile,
    @Param('examType') examType: string,
  ) {
    const normalizedTermId = Number(termId);
    // console.log('name', name);
    return this.enrolmentService.getOneTermById(normalizedTermId).then((term) =>
      this.reportsService.generateReports(
      name,
      term.num,
      term.year,
      examType,
      normalizedTermId,
      profile,
      ),
    );
  }

  @Post('/save/:name/:termId/:examType')
  @HasPermissions(PERMISSIONS.REPORTS.SAVE)
  saveReports(
    @Param('name') name: string,

    @Param('termId') termId: number,
    @Body() reports: ReportsModel[],
    @GetUser() profile,
    @Param('examType') examType: ExamType,
  ) {
    const normalizedTermId = Number(termId);
    return this.enrolmentService.getOneTermById(normalizedTermId).then((term) =>
      this.reportsService.saveReports(
        term.num,
        term.year,
        name,
        reports,
        examType,
        normalizedTermId,
        profile,
      ),
    );
  }

  @Post('/save/')
  @HasPermissions(PERMISSIONS.REPORTS.EDIT_COMMENT)
  saveHeadComment(
    @Body() comment: HeadCommentDto,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.reportsService.saveHeadComment(comment, profile);
  }

  @Post('/save-teacher-comment')
  @HasPermissions(PERMISSIONS.REPORTS.EDIT_COMMENT)
  saveTeacherComment(
    @Body() comment: TeacherCommentDto,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.reportsService.saveTeacherComment(comment, profile);
  }

  @Post('/generate-role-comment')
  @HasPermissions(PERMISSIONS.REPORTS.EDIT_COMMENT)
  generateRoleComment(
    @Body() payload: GenerateRoleCommentDto,
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  ) {
    return this.reportsService.generateRoleComment(payload, profile);
  }

  @Get('/view/:name/:termId/:examType')
  viewReports(
    @Param('name') name: string,

    @Param('termId') termId: number,
    @GetUser() profile,
    @Param('examType') examType: string,
  ) {
    const normalizedTermId = Number(termId);
    return this.enrolmentService.getOneTermById(normalizedTermId).then((term) =>
      this.reportsService.viewReports(
        name,
        term.num,
        term.year,
        examType,
        normalizedTermId,
        profile,
      ),
    );
  }

  @Get('/view/:studentNumber')
  getStudentReports(@Param('studentNumber') studentNumber: string) {
    return this.reportsService.getStudentReports(studentNumber);
  }

  @Get('/search')
  @HasPermissions(PERMISSIONS.REPORTS.VIEW)
  searchReports(
    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
    @Query('studentNumber') studentNumber?: string,
    @Query('name') name?: string,
    @Query('termId') termId?: string,
    @Query('examType') examType?: string,
  ) {
    return this.reportsService.searchReports(
      {
        studentNumber,
        name,
        termId: termId ? parseInt(termId, 10) : undefined,
        examType,
      },
      profile,
    );
  }

  // @Get('view')
  // getOneReport(
  //   @Param('num') num: number,
  //   @Param('year') year: number,
  //   @Param('name') name: string,
  //   @Param('studentNumber') studentNumber: string,
  //   @GetUser() profile,
  // ) {
  //   return this.reportsService.getOneReport(
  //     num,
  //     year,
  //     name,
  //     studentNumber,
  //     profile,
  //   );
  // }

  @Get('/pdf/:name/:termId/:examType/:studentNumber/')
  @HasPermissions(PERMISSIONS.REPORTS.DOWNLOAD)
  async getOnePDF(
    @Param('name') name: string,
    @Param('termId') termId: number,
    @Param('examType') examType: string,
    @Param('studentNumber') studentNumber: string,

    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
    @Res() res: Response,
  ): Promise<void> {
    const normalizedTermId = Number(termId);
    const term = await this.enrolmentService.getOneTermById(normalizedTermId);
    const result = await this.reportsService.downloadReport(
      name,
      term.num,
      term.year,
      examType,
      studentNumber,
      normalizedTermId,
      profile,
    );

    // const filename = `${studentNumber}_${name}_${num}_${year}_report.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': result.buffer.length,
    });

    res.end(result.buffer);
  }

  // @Get('/pdf/:name/:termId')
  // async getAllPDFs(
  //   @Param('name') name: string,
  //   @Param('num') num: number,
  //   @Param('year') year: number,
  //   @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
  //   @Res() res: Response,
  // ): Promise<void> {
  //   const studentNumber = '';

  //   const buffer = await this.reportsService.downloadReports(
  //     name,
  //     num,
  //     year,
  //     studentNumber,
  //     profile,
  //   );

  //   res.set({
  //     'Content-Type': 'application/pdf',
  //     'Content-Disposition': 'attachment; filename=example.pdf',
  //     'Content-Length': buffer.length,
  //   });

  //   res.end(buffer);
  // }
}
