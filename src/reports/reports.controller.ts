/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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
import { ReportsModel } from './models/reports.model';
import { ExamType } from 'src/marks/models/examtype.enum';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { HasPermissions } from 'src/auth/decorators/has-permissions.decorator';
import { PERMISSIONS } from 'src/auth/models/permissions.constants';

@Controller('reports')
@UseGuards(AuthGuard(), PermissionsGuard)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('/generate/:name/:num/:year/:examType')
  @HasPermissions(PERMISSIONS.REPORTS.GENERATE)
  generateReports(
    @Param('name') name: string,
    @Param('num') num: number,
    @Param('year') year: number,
    @Param('examType') examType: string,
    @GetUser() profile,
  ) {
    // console.log('name', name);
    return this.reportsService.generateReports(
      name,
      num,
      year,
      examType,
      profile,
    );
  }

  @Post('/save/:name/:num/:year/:examType')
  @HasPermissions(PERMISSIONS.REPORTS.SAVE)
  saveReports(
    @Param('name') name: string,

    @Param('num') num: number,
    @Param('year') year: number,
    @Param('examType') examType: ExamType,
    @Body() reports: ReportsModel[],
    @GetUser() profile,
  ) {
    return this.reportsService.saveReports(
      num,
      year,
      name,
      reports,
      examType,
      profile,
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

  @Get('/view/:name/:num/:year/:examType')
  viewReports(
    @Param('name') name: string,

    @Param('num') num: number,
    @Param('year') year: number,
    @Param('examType') examType: string,
    @GetUser() profile,
  ) {
    return this.reportsService.viewReports(name, num, year, examType, profile);
  }

  @Get('/view/:studentNumber')
  getStudentReports(@Param('studentNumber') studentNumber: string) {
    return this.reportsService.getStudentReports(studentNumber);
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

  @Get('/pdf/:name/:num/:year/:examType/:studentNumber/')
  @HasPermissions(PERMISSIONS.REPORTS.DOWNLOAD)
  async getOnePDF(
    @Param('name') name: string,
    @Param('num') num: number,
    @Param('year') year: number,
    @Param('examType') examType: string,
    @Param('studentNumber') studentNumber: string,

    @GetUser() profile: TeachersEntity | StudentsEntity | ParentsEntity,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.reportsService.downloadReport(
      name,
      num,
      year,
      examType,
      studentNumber,
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

  // @Get('/pdf/:name/:num/:year')
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
